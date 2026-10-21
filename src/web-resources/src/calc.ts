import type { StoredValue } from "./model";

/** Calculated values ("Calculate" steps). Everything here is plain data plus pure functions, so it is stored as JSON and tested without a form. */

export type DateUnit = "days" | "weeks" | "months" | "years" | "workdays";

export type DateBase =
  | { source: "now" }
  | { source: "current" }
  | { source: "column"; column: string }
  | { source: "fixed"; value: string };

export interface DateCalc { kind: "date"; base: DateBase; amount: number; unit: DateUnit }

export interface TextCalc { kind: "text"; mode: "append" | "prepend" | "replace"; text: string; separator: "none" | "space" | "newline" }

export type NumberSource = { source: "current" } | { source: "column"; column: string } | { source: "value"; value: number };
export type NumberOperand = { source: "column"; column: string } | { source: "value"; value: number };
export type NumberOp = "add" | "subtract" | "multiply" | "percent";
export interface NumberCalc { kind: "number"; base: NumberSource; op: NumberOp; operand: NumberOperand }

export type CalcSpec = DateCalc | TextCalc | NumberCalc;

export interface CalcContext {
  now: Date;
  userName: string;
  /** The column the step sets. */
  target: string;
  /** Date-only target columns get a YYYY-MM-DD result. */
  dateOnly: boolean;
  /** Decimal places of a decimal or currency target; integer targets are rounded to whole numbers. */
  precision?: number;
  integer: boolean;
  /** Current value of a column, including what earlier steps of the same replay set. */
  value(column: string): StoredValue;
  /** Readable text of a column value, for placeholders. */
  text(column: string): string;
  locale?: string;
}

export type CalcResult = { ok: true; value: StoredValue } | { ok: false; reason: "inputMissing" | "invalid" };

const pad = (n: number): string => String(n).padStart(2, "0");

export function calcTypes(): string[] {
  return ["datetime", "string", "memo", "integer", "decimal", "double", "money"];
}

export function isCalculable(columnType: string): boolean {
  return calcTypes().includes(columnType);
}

export function calcKindFor(columnType: string): CalcSpec["kind"] | null {
  if (columnType === "datetime") return "date";
  if (columnType === "string" || columnType === "memo") return "text";
  if (["integer", "decimal", "double", "money"].includes(columnType)) return "number";
  return null;
}

/** A fresh spec with sensible defaults for the column type. */
export function defaultCalc(columnType: string): CalcSpec | null {
  switch (calcKindFor(columnType)) {
    case "date": return { kind: "date", base: { source: "now" }, amount: 0, unit: "days" };
    case "text": return { kind: "text", mode: "append", text: "", separator: "space" };
    case "number": return { kind: "number", base: { source: "current" }, op: "add", operand: { source: "value", value: 0 } };
    default: return null;
  }
}

/** The other columns a spec reads; they must exist on the form that is replayed on. */
export function calcColumns(spec: CalcSpec): string[] {
  const out = new Set<string>();
  if (spec.kind === "date") {
    if (spec.base.source === "column") out.add(spec.base.column);
  } else if (spec.kind === "number") {
    if (spec.base.source === "column") out.add(spec.base.column);
    if (spec.operand.source === "column") out.add(spec.operand.column);
  } else {
    for (const name of placeholders(spec.text)) if (!BUILTIN.includes(name.toLowerCase())) out.add(name);
  }
  return [...out];
}

const BUILTIN = ["today", "now", "user"];

/** Whether a spec is complete enough to save: every chosen column, date and number is filled in. */
export function calcValid(spec: CalcSpec | undefined): boolean {
  if (!spec) return false;
  if (spec.kind === "date") {
    const baseOk = spec.base.source === "column" ? !!spec.base.column : spec.base.source === "fixed" ? parseDate(spec.base.value) !== null : true;
    return baseOk && Number.isFinite(spec.amount);
  }
  if (spec.kind === "text") return spec.text.trim() !== "";
  const baseOk = spec.base.source === "column" ? !!spec.base.column : spec.base.source === "value" ? Number.isFinite(spec.base.value) : true;
  const operandOk = spec.operand.source === "column" ? !!spec.operand.column : Number.isFinite(spec.operand.value);
  return baseOk && operandOk;
}

export function placeholders(text: string): string[] {
  return [...text.matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)].map((m) => m[1]!);
}

/** Parses a stored date: YYYY-MM-DD is a local date, anything else an ISO instant. */
export function parseDate(value: StoredValue): Date | null {
  if (typeof value !== "string" || value === "") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(d: Date, dateOnly: boolean): string {
  return dateOnly ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : d.toISOString();
}

export function addMonths(d: Date, months: number): Date {
  const out = new Date(d.getTime());
  const day = out.getDate();
  out.setDate(1);
  out.setMonth(out.getMonth() + months);
  const last = new Date(out.getFullYear(), out.getMonth() + 1, 0).getDate();
  out.setDate(Math.min(day, last));
  return out;
}

/** Adds working days (Monday to Friday). A start on a weekend counts from the next working day when moving forward. */
export function addWorkdays(d: Date, days: number): Date {
  const out = new Date(d.getTime());
  const step = days < 0 ? -1 : 1;
  let left = Math.abs(days);
  while (left > 0) {
    // Moving by calendar day keeps the wall-clock time across daylight saving changes.
    out.setDate(out.getDate() + step);
    const wd = out.getDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return out;
}

function addToDate(d: Date, amount: number, unit: DateUnit): Date {
  switch (unit) {
    case "days": { const o = new Date(d.getTime()); o.setDate(o.getDate() + amount); return o; }
    case "weeks": { const o = new Date(d.getTime()); o.setDate(o.getDate() + amount * 7); return o; }
    case "months": return addMonths(d, amount);
    case "years": return addMonths(d, amount * 12);
    case "workdays": return addWorkdays(d, amount);
  }
}

function roundTo(n: number, ctx: CalcContext): number {
  if (ctx.integer) return Math.round(n);
  if (typeof ctx.precision === "number") {
    const f = 10 ** ctx.precision;
    return Math.round((n + Number.EPSILON) * f) / f;
  }
  return n;
}

function toNumber(v: StoredValue): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function expand(text: string, ctx: CalcContext): string {
  const locale = ctx.locale;
  return text.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_, name: string) => {
    switch (name.toLowerCase()) {
      case "today": return ctx.now.toLocaleDateString(locale);
      case "now": return ctx.now.toLocaleString(locale);
      case "user": return ctx.userName;
      default: return ctx.text(name);
    }
  });
}

const SEPARATOR = { none: "", space: " ", newline: "\n" } as const;

/** Works out the value of a Calculate step. Never throws; unusable input is reported as a reason. */
export function evaluateCalc(spec: CalcSpec, ctx: CalcContext): CalcResult {
  switch (spec.kind) {
    case "date": {
      if (!Number.isFinite(spec.amount)) return { ok: false, reason: "invalid" };
      let base: Date | null;
      switch (spec.base.source) {
        case "now": base = new Date(ctx.now.getTime()); break;
        case "current": base = parseDate(ctx.value(ctx.target)); break;
        case "column": base = parseDate(ctx.value(spec.base.column)); break;
        case "fixed": base = parseDate(spec.base.value); break;
      }
      if (!base) return { ok: false, reason: "inputMissing" };
      if (ctx.dateOnly) base.setHours(0, 0, 0, 0);
      return { ok: true, value: formatDate(addToDate(base, Math.trunc(spec.amount), spec.unit), ctx.dateOnly) };
    }
    case "text": {
      const addition = expand(spec.text, ctx);
      const current = ctx.value(ctx.target);
      const existing = typeof current === "string" ? current : "";
      const sep = existing === "" || addition === "" ? "" : SEPARATOR[spec.separator];
      if (spec.mode === "replace") return { ok: true, value: addition === "" ? null : addition };
      const value = spec.mode === "append" ? existing + sep + addition : addition + sep + existing;
      return { ok: true, value: value === "" ? null : value };
    }
    case "number": {
      const base = spec.base.source === "current" ? toNumber(ctx.value(ctx.target)) : spec.base.source === "column" ? toNumber(ctx.value(spec.base.column)) : toNumber(spec.base.value);
      const operand = spec.operand.source === "column" ? toNumber(ctx.value(spec.operand.column)) : toNumber(spec.operand.value);
      if (base === null || operand === null) return { ok: false, reason: "inputMissing" };
      const raw = spec.op === "add" ? base + operand : spec.op === "subtract" ? base - operand : spec.op === "multiply" ? base * operand : base * (1 + operand / 100);
      return Number.isFinite(raw) ? { ok: true, value: roundTo(raw, ctx) } : { ok: false, reason: "invalid" };
    }
  }
}
