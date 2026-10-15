import { describe, expect, it } from "vitest";
import { Recorder } from "../src/recorder";
import { apply, plan } from "../src/player";
import { AttrLike, readValue, toXrmValue } from "../src/value-codec";
import { Step } from "../src/model";

class FakeAttr implements AttrLike {
  private handlers: Array<(c: unknown) => void> = [];
  controls = { get: () => [{ getDisabled: () => this.disabled }] };
  constructor(private name: string, private type: string, private value: unknown = null, public disabled = false, private format: string | null = null) {}
  getName() { return this.name; }
  getAttributeType() { return this.type; }
  getValue() { return this.value; }
  setValue(v: unknown) { this.value = v; }
  getFormat() { return this.format; }
  fireOnChange() { this.handlers.forEach((h) => h({})); }
  addOnChange(h: (c: unknown) => void) { this.handlers.push(h); }
  removeOnChange(h: (c: unknown) => void) { this.handlers = this.handlers.filter((x) => x !== h); }
  /** Simulates a user edit. */
  edit(v: unknown) { this.value = v; this.fireOnChange(); }
}

const form = (...attrs: FakeAttr[]) => ({ entityName: "incident", attributes: attrs });

describe("Recorder", () => {
  it("collapses repeated edits into one step and keeps first-edit order", () => {
    const a = new FakeAttr("title", "string", "old");
    const b = new FakeAttr("description", "memo", "");
    const rec = new Recorder();
    rec.start(form(a, b));
    b.edit("x");
    a.edit("new1");
    b.edit("final");
    a.edit("new2");
    const steps = rec.stop();
    expect(steps.map((s) => [s.column, s.value])).toEqual([["description", "final"], ["title", "new2"]]);
    expect(steps.map((s) => s.sortOrder)).toEqual([10, 20]);
  });

  it("drops a column that ends with its starting value", () => {
    const a = new FakeAttr("title", "string", "same");
    const rec = new Recorder();
    rec.start(form(a));
    a.edit("other");
    a.edit("same");
    expect(rec.stop()).toEqual([]);
  });

  it("records a cleared column as a clear operation", () => {
    const a = new FakeAttr("title", "string", "x");
    const rec = new Recorder();
    rec.start(form(a));
    a.edit(null);
    const [s] = rec.stop();
    expect(s).toMatchObject({ operation: "clear", column: "title" });
    expect(s).not.toHaveProperty("value");
  });

  it("ignores unsupported column types and stops listening after stop", () => {
    const img = new FakeAttr("entityimage", "image", null);
    const a = new FakeAttr("title", "string", "x");
    const rec = new Recorder();
    rec.start(form(img, a));
    img.edit("blob");
    rec.stop();
    a.edit("after stop");
    expect(rec.snapshot()).toEqual([]);
    expect(rec.isRecording).toBe(false);
  });

  it("normalises lookups and multi-select values", () => {
    const l = new FakeAttr("productid", "lookup", null);
    const m = new FakeAttr("tags", "multiselectoptionset", [3, 1]);
    const rec = new Recorder();
    rec.start(form(l, m));
    l.edit([{ id: "{33333333-3333-3333-3333-333333333333}", entityType: "product", name: null }]);
    m.edit([5, 2]);
    const steps = rec.stop();
    expect(steps[0]!.value).toEqual({ entityType: "product", id: "33333333-3333-3333-3333-333333333333" });
    expect(steps[1]!.value).toEqual([2, 5]);
  });
});

describe("value codec", () => {
  it("stores date-only columns without a timezone shift", () => {
    const d = new FakeAttr("due", "datetime", new Date(2026, 9, 14, 0, 0), false, "date");
    expect(readValue(d)).toBe("2026-10-14");
    const back = toXrmValue(d, "2026-10-14") as Date;
    expect([back.getFullYear(), back.getMonth(), back.getDate()]).toEqual([2026, 9, 14]);
  });

  it("round-trips a lookup into the Xrm shape", () => {
    const l = new FakeAttr("productid", "lookup", null);
    expect(toXrmValue(l, { entityType: "product", id: "33333333-3333-3333-3333-333333333333", name: "P" })).toEqual([
      { id: "{33333333-3333-3333-3333-333333333333}", entityType: "product", name: "P" },
    ]);
  });
});

describe("player", () => {
  const set = (column: string, columnType: string, value: Step["value"], extra: Partial<Step> = {}): Step => ({
    sortOrder: 10, operation: "set", valueMode: "fixed", column, columnType, value, ...extra,
  });

  it("plans and applies changes, leaving unchanged values alone", () => {
    const title = new FakeAttr("title", "string", "old");
    const same = new FakeAttr("description", "memo", "keep");
    const f = form(title, same);
    const items = plan(f, [set("title", "string", "new"), set("description", "memo", "keep", { sortOrder: 20 })]);
    expect(items.map((i) => i.status)).toEqual(["apply", "noop"]);
    const res = apply(f, items);
    expect(res.applied).toEqual(["title"]);
    expect(title.getValue()).toBe("new");
  });

  it("skips missing, read-only, mismatched and unprompted steps with a reason", () => {
    const ro = new FakeAttr("a", "string", "x", true);
    const num = new FakeAttr("n", "integer", 1);
    const p = new FakeAttr("p", "string", "");
    const items = plan(form(ro, num, p), [
      set("gone", "string", "v", { sortOrder: 1 }),
      set("a", "string", "v", { sortOrder: 2 }),
      set("n", "string", "v", { sortOrder: 3 }),
      set("p", "string", undefined, { sortOrder: 4, valueMode: "prompt" }),
    ]);
    expect(items.map((i) => i.reason)).toEqual(["missing", "readonly", "typeMismatch", "needsInput"]);
  });

  it("uses prompt answers and copies from another column", () => {
    const p = new FakeAttr("p", "string", "");
    const dst = new FakeAttr("dst", "string", "");
    const src = new FakeAttr("src", "string", "from source");
    const f = form(p, dst, src);
    const items = plan(
      f,
      [set("p", "string", undefined, { valueMode: "prompt" }), set("dst", "string", undefined, { sortOrder: 20, valueMode: "copy", sourceColumn: "src" })],
      { answers: { p: "typed" } },
    );
    apply(f, items);
    expect([p.getValue(), dst.getValue()]).toEqual(["typed", "from source"]);
  });

  it("copies the value an earlier step sets, not the old form value", () => {
    const title = new FakeAttr("title", "string", "old");
    const dst = new FakeAttr("dst", "string", "");
    const f = form(title, dst);
    const items = plan(f, [set("title", "string", "new"), set("dst", "string", undefined, { sortOrder: 20, valueMode: "copy", sourceColumn: "title" })]);
    apply(f, items);
    expect(dst.getValue()).toBe("new");
  });

  it("does not trigger the recorder while replaying when it is stopped", () => {
    const t = new FakeAttr("title", "string", "old");
    const f = form(t);
    const rec = new Recorder();
    rec.start(f);
    rec.stop();
    apply(f, plan(f, [set("title", "string", "new")]));
    expect(rec.snapshot()).toEqual([]);
  });
});
