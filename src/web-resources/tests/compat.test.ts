import { describe, expect, it } from "vitest";
import { ColumnInfo, copyCandidates, isCopyCompatible, isValueAllowed, loadColumns } from "../src/compat";
import { apply, plan } from "../src/player";
import { AttrLike } from "../src/value-codec";
import { Step } from "../src/model";
import { Api, stepToPayload } from "../src/store";

interface Opts {
  options?: Array<{ value: number; text: string }>;
  maxLength?: number;
  min?: number;
  max?: number;
  precision?: number;
  format?: string;
  targets?: string[];
}

class Attr implements AttrLike {
  controls: AttrLike["controls"];
  constructor(private name: string, private type: string, private value: unknown = null, private o: Opts = {}) {
    this.controls = { get: () => [{ getDisabled: () => false, getLabel: () => name.toUpperCase(), getEntityTypes: () => o.targets ?? [] }] };
  }
  getName() { return this.name; }
  getAttributeType() { return this.type; }
  getValue() { return this.value; }
  setValue(v: unknown) { this.value = v; }
  getFormat() { return this.o.format ?? null; }
  getOptions() { return this.o.options ?? []; }
  getMaxLength() { return this.o.maxLength as number; }
  getMin() { return this.o.min as number; }
  getMax() { return this.o.max as number; }
  getPrecision() { return this.o.precision as number; }
  fireOnChange() {}
  addOnChange() {}
  removeOnChange() {}
}

const col = (name: string, type: string, extra: Partial<ColumnInfo> = {}): ColumnInfo => ({ name, label: name, type, ...extra });
const yesNo = [{ value: 1, text: "Yes" }, { value: 2, text: "No" }];
const prio = [{ value: 1, text: "High" }, { value: 2, text: "Low" }];
const step = (patch: Partial<Step> & Pick<Step, "column" | "columnType">): Step => ({ sortOrder: 10, operation: "set", valueMode: "fixed", ...patch });
const form = (...attrs: Attr[]) => ({ entityName: "incident", attributes: attrs });

describe("copy compatibility", () => {
  it("only allows the same type or a lossless widening", () => {
    expect(isCopyCompatible(col("a", "boolean"), col("b", "boolean"))).toBe(true);
    expect(isCopyCompatible(col("a", "boolean"), col("b", "optionset"))).toBe(false);
    expect(isCopyCompatible(col("a", "boolean"), col("b", "integer"))).toBe(false);
    expect(isCopyCompatible(col("a", "string"), col("b", "memo"))).toBe(true);
    expect(isCopyCompatible(col("a", "memo"), col("b", "string"))).toBe(false);
    expect(isCopyCompatible(col("a", "integer"), col("b", "decimal"))).toBe(true);
    expect(isCopyCompatible(col("a", "decimal"), col("b", "integer"))).toBe(false);
    expect(isCopyCompatible(col("a", "money"), col("b", "decimal"))).toBe(false);
  });

  it("never offers a column as its own source", () => {
    expect(isCopyCompatible(col("a", "string"), col("a", "string"))).toBe(false);
  });

  it("needs the same list of choices for option sets", () => {
    expect(isCopyCompatible(col("a", "optionset", { optionKey: "x" }), col("b", "optionset", { optionKey: "x" }))).toBe(true);
    expect(isCopyCompatible(col("a", "optionset", { optionKey: "x" }), col("b", "optionset", { optionKey: "y" }))).toBe(false);
    expect(isCopyCompatible(col("a", "optionset"), col("b", "optionset"))).toBe(false);
  });

  it("needs a shared lookup target and the same date format", () => {
    expect(isCopyCompatible(col("a", "lookup", { targets: ["account", "contact"] }), col("b", "lookup", { targets: ["contact"] }))).toBe(true);
    expect(isCopyCompatible(col("a", "lookup", { targets: ["account"] }), col("b", "lookup", { targets: ["contact"] }))).toBe(false);
    expect(isCopyCompatible(col("a", "datetime", { format: "date" }), col("b", "datetime", { format: "datetime" }))).toBe(false);
    expect(isCopyCompatible(col("a", "datetime", { format: "date" }), col("b", "datetime", { format: "date" }))).toBe(true);
  });

  it("lists only compatible columns, sorted by label", () => {
    const all = [col("z", "boolean", { label: "Zed" }), col("b", "boolean", { label: "Bee" }), col("t", "string"), col("self", "boolean")];
    expect(copyCandidates(col("self", "boolean"), all).map((c) => c.name)).toEqual(["b", "z"]);
    expect(copyCandidates(undefined, all)).toEqual([]);
  });
});

describe("value validation", () => {
  it("checks option values against the target options", () => {
    expect(isValueAllowed(new Attr("p", "optionset", null, { options: prio }), 2)).toBe(true);
    expect(isValueAllowed(new Attr("p", "optionset", null, { options: prio }), 9)).toBe(false);
    expect(isValueAllowed(new Attr("p", "multiselectoptionset", null, { options: prio }), [1, 9])).toBe(false);
  });

  it("checks text length, number range, whole numbers and decimal places", () => {
    expect(isValueAllowed(new Attr("s", "string", null, { maxLength: 3 }), "abcd")).toBe(false);
    expect(isValueAllowed(new Attr("n", "integer", null, { min: 0, max: 10 }), 11)).toBe(false);
    expect(isValueAllowed(new Attr("n", "integer"), 1.5)).toBe(false);
    expect(isValueAllowed(new Attr("d", "decimal", null, { precision: 2 }), 1.234)).toBe(false);
    expect(isValueAllowed(new Attr("d", "decimal", null, { precision: 2 }), 1.23)).toBe(true);
  });

  it("only accepts lookups the control can point to", () => {
    const a = new Attr("l", "lookup", null, { targets: ["contact"] });
    expect(isValueAllowed(a, { entityType: "contact", id: "1" })).toBe(true);
    expect(isValueAllowed(a, { entityType: "account", id: "1" })).toBe(false);
  });
});

describe("plan with copy and ask steps", () => {
  it("copies between compatible columns and skips incompatible ones", () => {
    const src = new Attr("a", "boolean", true);
    const okDst = new Attr("b", "boolean", false);
    const badSrc = new Attr("c", "optionset", 1, { options: prio });
    const badDst = new Attr("d", "boolean", false);
    const items = plan(form(src, okDst, badSrc, badDst), [
      step({ column: "b", columnType: "boolean", valueMode: "copy", sourceColumn: "a" }),
      step({ column: "d", columnType: "boolean", valueMode: "copy", sourceColumn: "c", sortOrder: 20 }),
    ]);
    expect(items.map((i) => [i.status, i.reason])).toEqual([["apply", undefined], ["skip", "sourceIncompatible"]]);
    apply(form(src, okDst), items);
    expect(okDst.getValue()).toBe(true);
  });

  it("does not copy option sets that have different lists of choices", () => {
    const src = new Attr("a", "optionset", 1, { options: yesNo });
    const dst = new Attr("b", "optionset", null, { options: prio });
    expect(plan(form(src, dst), [step({ column: "b", columnType: "optionset", valueMode: "copy", sourceColumn: "a" })])[0]!.reason).toBe("sourceIncompatible");
  });

  it("waits for an answer, then applies it when the target accepts it", () => {
    const dst = new Attr("p", "optionset", null, { options: prio });
    const s = step({ column: "p", columnType: "optionset", valueMode: "prompt" });
    expect(plan(form(dst), [s])[0]).toMatchObject({ status: "skip", reason: "needsInput" });
    expect(plan(form(dst), [s], { answers: { p: 2 } })[0]).toMatchObject({ status: "apply", next: 2 });
    expect(plan(form(dst), [s], { answers: { p: 9 } })[0]).toMatchObject({ status: "skip", reason: "valueNotAllowed" });
  });

  it("answers null to clear the column and treats an empty answer list as an answer", () => {
    const dst = new Attr("p", "optionset", 1, { options: prio });
    const s = step({ column: "p", columnType: "optionset", valueMode: "prompt" });
    expect(plan(form(dst), [s], { answers: { p: null } })[0]).toMatchObject({ status: "apply", next: null });
  });

  it("skips a fixed step that has no stored value instead of clearing the column", () => {
    const dst = new Attr("t", "string", "keep");
    expect(plan(form(dst), [step({ column: "t", columnType: "string" })])[0]).toMatchObject({ status: "skip", reason: "needsInput" });
  });
});

describe("stored steps", () => {
  it("keeps the recorded value only for fixed steps", () => {
    const base = { sortOrder: 10, operation: "set" as const, column: "t", columnType: "string", value: "secret" };
    expect(stepToPayload({ ...base, valueMode: "fixed" }).bassllab_value).toBe('"secret"');
    expect(stepToPayload({ ...base, valueMode: "prompt", promptText: "Q" })).toMatchObject({ bassllab_value: null, bassllab_prompttext: "Q" });
    expect(stepToPayload({ ...base, valueMode: "copy", sourceColumn: "s", promptText: "old" })).toMatchObject({ bassllab_value: null, bassllab_sourcecolumnlogicalname: "s", bassllab_prompttext: null });
  });
});

describe("loadColumns", () => {
  it("combines base metadata with option set, lookup and date details", async () => {
    const api: Api = {
      async request(_m, path) {
        const ok = (value: unknown[]) => ({ data: { value }, headers: { get: () => null } });
        if (path.includes("PicklistAttributeMetadata")) return ok([{ LogicalName: "prio", GlobalOptionSet: { Name: "prioset" } }]);
        if (path.includes("LookupAttributeMetadata")) return ok([{ LogicalName: "cust", Targets: ["account", "contact"] }]);
        if (path.includes("DateTimeAttributeMetadata")) return ok([{ LogicalName: "due", Format: "DateOnly" }]);
        if (path.includes("MultiSelectPicklistAttributeMetadata")) throw new Error("403");
        return ok([
          { LogicalName: "prio", AttributeTypeName: { Value: "PicklistType" }, DisplayName: { UserLocalizedLabel: { Label: "Priority" } } },
          { LogicalName: "cust", AttributeTypeName: { Value: "CustomerType" } },
          { LogicalName: "due", AttributeTypeName: { Value: "DateTimeType" } },
          { LogicalName: "img", AttributeTypeName: { Value: "ImageType" } },
          { LogicalName: "yomi", AttributeTypeName: { Value: "StringType" }, AttributeOf: "name" },
        ]);
      },
    };
    const cols = await loadColumns(api, "incident");
    expect(cols.map((c) => c.name).sort()).toEqual(["cust", "due", "prio"]);
    expect(cols.find((c) => c.name === "prio")).toMatchObject({ label: "Priority", type: "optionset", optionKey: "prioset" });
    expect(cols.find((c) => c.name === "cust")).toMatchObject({ type: "lookup", targets: ["account", "contact"] });
    expect(cols.find((c) => c.name === "due")).toMatchObject({ type: "datetime", format: "date" });
  });

  it("rejects table names that are not plain identifiers", async () => {
    await expect(loadColumns({ request: async () => ({ data: {}, headers: { get: () => null } }) }, "a')/x")).rejects.toThrow();
  });
});
