import { describe, expect, it } from "vitest";
import { CalcContext, CalcSpec, addMonths, addWorkdays, calcColumns, calcValid, defaultCalc, evaluateCalc, parseDate } from "../src/calc";
import { apply, plan } from "../src/player";
import { AttrLike, readValue } from "../src/value-codec";
import { Step, StoredValue } from "../src/model";
import { stepFromRow, stepToPayload } from "../src/store";

const ymd = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// 2026-10-15 is a Thursday.
const NOW = new Date(2026, 9, 15, 10, 30);

function ctx(values: Record<string, StoredValue>, over: Partial<CalcContext> = {}): CalcContext {
  return {
    now: NOW, userName: "Ada Lovelace", target: "t", dateOnly: false, integer: false, locale: "en-US",
    value: (c) => values[c] ?? null,
    text: (c) => String(values[c] ?? ""),
    ...over,
  };
}

const ok = (spec: CalcSpec, c: CalcContext): StoredValue => {
  const r = evaluateCalc(spec, c);
  if (!r.ok) throw new Error("not ok: " + r.reason);
  return r.value;
};

describe("working days and months", () => {
  it("skips weekends in both directions", () => {
    expect(ymd(addWorkdays(new Date(2026, 9, 16), 1))).toBe("2026-10-19"); // Friday + 1 = Monday
    expect(ymd(addWorkdays(new Date(2026, 9, 19), -1))).toBe("2026-10-16"); // Monday - 1 = Friday
    expect(ymd(addWorkdays(new Date(2026, 9, 19), 11))).toBe("2026-11-03");
    expect(ymd(addWorkdays(new Date(2026, 9, 17), 0))).toBe("2026-10-17");
    expect(ymd(addWorkdays(new Date(2026, 9, 17), 1))).toBe("2026-10-19"); // Saturday + 1 = Monday
  });

  it("keeps the time of day across the daylight saving change", () => {
    const d = addWorkdays(new Date(2026, 9, 21, 9, 15), 5); // crosses the end of DST in Europe on 25 October
    expect([d.getHours(), d.getMinutes()]).toEqual([9, 15]);
  });

  it("clamps the day when a month is shorter", () => {
    expect(ymd(addMonths(new Date(2026, 0, 31), 1))).toBe("2026-02-28");
    expect(ymd(addMonths(new Date(2028, 0, 31), 1))).toBe("2028-02-29");
    expect(ymd(addMonths(new Date(2026, 10, 30), -3))).toBe("2026-08-30");
  });
});

describe("date calculations", () => {
  it("adds days to today", () => {
    const v = ok({ kind: "date", base: { source: "now" }, amount: 15, unit: "days" }, ctx({}));
    expect(ymd(parseDate(v)!)).toBe("2026-10-30");
  });

  it("adds to another column and keeps its time", () => {
    const created = new Date(2026, 9, 1, 8, 45).toISOString();
    const v = ok({ kind: "date", base: { source: "column", column: "createdon" }, amount: 2, unit: "weeks" }, ctx({ createdon: created }));
    const d = parseDate(v)!;
    expect([ymd(d), d.getHours(), d.getMinutes()]).toEqual(["2026-10-15", 8, 45]);
  });

  it("returns a date-only value for date-only columns", () => {
    expect(ok({ kind: "date", base: { source: "now" }, amount: 11, unit: "workdays" }, ctx({}, { dateOnly: true }))).toBe("2026-10-30");
  });

  it("uses a fixed date or the current value of the column", () => {
    expect(ok({ kind: "date", base: { source: "fixed", value: "2026-12-24" }, amount: 1, unit: "days" }, ctx({}, { dateOnly: true }))).toBe("2026-12-25");
    expect(ok({ kind: "date", base: { source: "current" }, amount: -1, unit: "months" }, ctx({ t: "2026-03-31" }, { dateOnly: true }))).toBe("2026-02-28");
  });

  it("reports a missing base instead of guessing", () => {
    expect(evaluateCalc({ kind: "date", base: { source: "column", column: "createdon" }, amount: 1, unit: "days" }, ctx({}))).toEqual({ ok: false, reason: "inputMissing" });
    expect(evaluateCalc({ kind: "date", base: { source: "now" }, amount: Number.NaN, unit: "days" }, ctx({}))).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("text calculations", () => {
  const text = (mode: "append" | "prepend" | "replace", sep: "none" | "space" | "newline", t: string): CalcSpec => ({ kind: "text", mode, separator: sep, text: t });

  it("appends and prepends with a separator, and skips the separator for empty text", () => {
    expect(ok(text("append", "newline", "Checked"), ctx({ t: "Printer offline" }))).toBe("Printer offline\nChecked");
    expect(ok(text("prepend", "space", "URGENT:"), ctx({ t: "Printer offline" }))).toBe("URGENT: Printer offline");
    expect(ok(text("append", "newline", "Checked"), ctx({}))).toBe("Checked");
  });

  it("replaces the text", () => {
    expect(ok(text("replace", "none", "Done"), ctx({ t: "Old" }))).toBe("Done");
  });

  it("fills placeholders for today, the user and other columns", () => {
    const v = ok(text("append", "newline", "Escalated by {{user}} on {{today}} for {{customerid}}"), ctx({ t: "x", customerid: "Contoso" }));
    expect(v).toBe(`x\nEscalated by Ada Lovelace on ${NOW.toLocaleDateString("en-US")} for Contoso`);
    expect(calcColumns(text("append", "none", "{{ title }} {{today}} {{user}}"))).toEqual(["title"]);
  });
});

describe("number calculations", () => {
  const num = (base: CalcSpec & { kind: "number" }): CalcSpec => base;

  it("adds, subtracts, multiplies and applies a percentage", () => {
    const base = { source: "current" } as const;
    expect(ok(num({ kind: "number", base, op: "add", operand: { source: "value", value: 5 } }), ctx({ t: 10 }))).toBe(15);
    expect(ok(num({ kind: "number", base, op: "subtract", operand: { source: "column", column: "x" } }), ctx({ t: 10, x: 4 }))).toBe(6);
    expect(ok(num({ kind: "number", base, op: "multiply", operand: { source: "value", value: 3 } }), ctx({ t: 7 }))).toBe(21);
    expect(ok(num({ kind: "number", base, op: "percent", operand: { source: "value", value: 21 } }), ctx({ t: 100 }))).toBe(121);
    expect(ok(num({ kind: "number", base, op: "percent", operand: { source: "value", value: -10 } }), ctx({ t: 200 }))).toBe(180);
  });

  it("rounds to whole numbers or to the decimal places of the column", () => {
    const spec = num({ kind: "number", base: { source: "column", column: "a" }, op: "percent", operand: { source: "value", value: 9 } });
    expect(ok(spec, ctx({ a: 19.99 }, { integer: true }))).toBe(22);
    expect(ok(spec, ctx({ a: 19.99 }, { precision: 2 }))).toBe(21.79);
  });

  it("needs a number to start from", () => {
    expect(evaluateCalc(num({ kind: "number", base: { source: "current" }, op: "add", operand: { source: "value", value: 1 } }), ctx({}))).toEqual({ ok: false, reason: "inputMissing" });
  });
});

describe("validation and defaults", () => {
  it("checks that a calculation is complete", () => {
    expect(calcValid(defaultCalc("datetime")!)).toBe(true);
    expect(calcValid({ kind: "date", base: { source: "column", column: "" }, amount: 1, unit: "days" })).toBe(false);
    expect(calcValid({ kind: "date", base: { source: "fixed", value: "" }, amount: 1, unit: "days" })).toBe(false);
    expect(calcValid(defaultCalc("memo")!)).toBe(false);
    expect(calcValid({ kind: "text", mode: "append", separator: "space", text: "x" })).toBe(true);
    expect(calcValid({ kind: "number", base: { source: "current" }, op: "add", operand: { source: "column", column: "" } })).toBe(false);
    expect(defaultCalc("lookup")).toBeNull();
  });
});

class Attr implements AttrLike {
  controls: AttrLike["controls"];
  constructor(private name: string, private type: string, private value: unknown = null, private o: { format?: string; precision?: number; disabled?: boolean } = {}) {
    this.controls = { get: () => [{ getDisabled: () => !!o.disabled, getLabel: () => name }] };
  }
  getName() { return this.name; }
  getAttributeType() { return this.type; }
  getValue() { return this.value; }
  setValue(v: unknown) { this.value = v; }
  getFormat() { return this.o.format ?? null; }
  getPrecision() { return this.o.precision as number; }
  fireOnChange() {}
  addOnChange() {}
  removeOnChange() {}
}

const form = (...attrs: Attr[]) => ({ entityName: "incident", attributes: attrs });
const calcStep = (column: string, columnType: string, calc: CalcSpec, sortOrder = 10): Step => ({ sortOrder, operation: "set", valueMode: "calculate", column, columnType, calc });

describe("replay plan with calculations", () => {
  it("calculates from other columns and from what earlier steps set", () => {
    const created = new Attr("createdon", "datetime", new Date(2026, 9, 1, 9, 0));
    const followup = new Attr("followupby", "datetime", null, { format: "date" });
    const resolve = new Attr("resolveby", "datetime", null);
    const desc = new Attr("description", "memo", "Printer offline");
    const items = plan(form(created, followup, resolve, desc), [
      calcStep("followupby", "datetime", { kind: "date", base: { source: "column", column: "createdon" }, amount: 15, unit: "days" }, 10),
      calcStep("resolveby", "datetime", { kind: "date", base: { source: "column", column: "followupby" }, amount: 2, unit: "workdays" }, 20),
      calcStep("description", "memo", { kind: "text", mode: "append", separator: "newline", text: "Escalated by {{user}}" }, 30),
    ], { now: NOW, userName: "Ada", locale: "en-US" });
    expect(items.map((i) => i.status)).toEqual(["apply", "apply", "apply"]);
    expect(items[0]!.next).toBe("2026-10-16");
    expect(ymd(parseDate(items[1]!.next)!)).toBe("2026-10-20"); // Friday 16 + 2 working days
    expect(items[2]!.next).toBe("Printer offline\nEscalated by Ada");
    apply(form(followup, resolve, desc), items);
    expect(readValue(desc)).toBe("Printer offline\nEscalated by Ada");
  });

  it("skips with a clear reason when a referenced column is missing, of the wrong type or empty", () => {
    const target = new Attr("followupby", "datetime", null);
    const text = new Attr("title", "string", "x");
    const empty = new Attr("createdon", "datetime", null);
    const spec = (column: string): CalcSpec => ({ kind: "date", base: { source: "column", column }, amount: 1, unit: "days" });
    expect(plan(form(target), [calcStep("followupby", "datetime", spec("createdon"))])[0]!.reason).toBe("sourceMissing");
    expect(plan(form(target, text), [calcStep("followupby", "datetime", spec("title"))])[0]!.reason).toBe("sourceIncompatible");
    expect(plan(form(target, empty), [calcStep("followupby", "datetime", spec("createdon"))])[0]!.reason).toBe("calcInputMissing");
  });

  it("skips a calculation that does not fit the column type or has no spec, and respects value limits", () => {
    const n = new Attr("qty", "integer", 5);
    expect(plan(form(n), [calcStep("qty", "integer", { kind: "date", base: { source: "now" }, amount: 1, unit: "days" })])[0]!.reason).toBe("calcInvalid");
    expect(plan(form(n), [{ sortOrder: 10, operation: "set", valueMode: "calculate", column: "qty", columnType: "integer" }])[0]!.reason).toBe("calcInvalid");
    const money = new Attr("amount", "money", 100, { precision: 2 });
    const [r] = plan(form(money), [calcStep("amount", "money", { kind: "number", base: { source: "current" }, op: "percent", operand: { source: "value", value: 21 } })]);
    expect(r).toMatchObject({ status: "apply", next: 121 });
  });
});

describe("stored calculation", () => {
  it("round-trips through the step payload and keeps no recorded value", () => {
    const calc: CalcSpec = { kind: "date", base: { source: "column", column: "createdon" }, amount: 11, unit: "workdays" };
    const step: Step = { sortOrder: 10, operation: "set", valueMode: "calculate", column: "followupby", columnType: "datetime", value: "2026-01-01", calc };
    const payload = stepToPayload(step);
    expect(payload).toMatchObject({ msftnl_valuemode: 100000003, msftnl_value: null, msftnl_sourcecolumnlogicalname: null });
    const back = stepFromRow({ ...payload, msftnl_columnlogicalname: "followupby" });
    expect(back).toMatchObject({ valueMode: "calculate", calc });
    expect(back.value).toBeUndefined();
  });

  it("ignores a calculation that is not valid JSON", () => {
    const back = stepFromRow({ msftnl_sortorder: 10, msftnl_operation: 100000000, msftnl_valuemode: 100000003, msftnl_columnlogicalname: "x", msftnl_columntype: "datetime", msftnl_calculation: "{oops" });
    expect(back.calc).toBeUndefined();
  });

  it("does not store a calculation for other modes", () => {
    const step: Step = { sortOrder: 10, operation: "set", valueMode: "fixed", column: "x", columnType: "string", value: "a", calc: { kind: "text", mode: "append", separator: "none", text: "z" } };
    expect(stepToPayload(step).msftnl_calculation).toBeNull();
  });
});
