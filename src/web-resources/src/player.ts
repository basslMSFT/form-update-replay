import { FormLike } from "./recorder";
import { AttrLike, readValue, toXrmValue, valuesEqual } from "./value-codec";
import { Step, StoredLookup, StoredValue, isSupportedType } from "./model";
import { columnInfoFromAttr, isCopyCompatible, isValueAllowed } from "./compat";
import { CalcContext, CalcSpec, calcColumns, calcKindFor, evaluateCalc } from "./calc";
import { t } from "./i18n";

export type SkipReason =
  | "missing" | "readonly" | "unsupported" | "typeMismatch" | "needsInput" | "sourceMissing" | "sourceIncompatible" | "valueNotAllowed"
  | "calcInputMissing" | "calcInvalid";

export interface PlanItem {
  step: Step;
  status: "apply" | "noop" | "skip";
  reason?: SkipReason;
  current: StoredValue;
  next: StoredValue;
}

export interface PlayOptions {
  /** Answers for steps with valueMode "prompt", keyed by column logical name. */
  answers?: Record<string, StoredValue>;
  /** For Calculate steps: the clock, the signed-in user's name and the locale used for placeholders. */
  now?: Date;
  userName?: string;
  locale?: string;
}

const NUMERIC = ["integer", "decimal", "double", "money"];

/** Whether the other columns a calculation reads have a type it can use. */
function calcColumnsUsable(spec: CalcSpec, typeOf: (column: string) => string): boolean {
  if (spec.kind === "date") return spec.base.source !== "column" || typeOf(spec.base.column) === "datetime";
  if (spec.kind === "number") {
    return (spec.base.source !== "column" || NUMERIC.includes(typeOf(spec.base.column))) && (spec.operand.source !== "column" || NUMERIC.includes(typeOf(spec.operand.column)));
  }
  return true;
}

/** Readable text of a stored value, used when a column is placed inside text. */
function displayText(attr: AttrLike, value: StoredValue): string {
  if (value === null || value === undefined) return "";
  switch (attr.getAttributeType()) {
    case "lookup": return (value as StoredLookup).name ?? "";
    case "optionset": return attr.getOptions?.().find((o) => o.value === value)?.text ?? String(value);
    case "multiselectoptionset": return (value as number[]).map((v) => attr.getOptions?.().find((o) => o.value === v)?.text ?? String(v)).join(", ");
    case "boolean": return value === true ? t("yes") : t("no");
    case "datetime": {
      const s = String(value);
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`).toLocaleDateString() : new Date(s).toLocaleString();
    }
    default: return String(value);
  }
}

/** A column is available when at least one of its controls is shown; hidden controls, sections and tabs count as not on the form. */
export function isAvailable(attr: AttrLike): boolean {
  const controls = attr.controls?.get() ?? [];
  return controls.some((c) => {
    if (c.getVisible?.() === false) return false;
    const section = c.getParent?.();
    if (!section) return true;
    if (section.getVisible?.() === false) return false;
    return section.getParent?.()?.getVisible?.() !== false;
  });
}

function isReadOnly(attr: AttrLike): boolean {
  const priv = attr.getUserPrivilege?.();
  if (priv && !priv.canUpdate && !priv.canCreate) return true;
  return (attr.controls?.get() ?? []).every((c) => c.getDisabled?.() === true);
}

/** Works out what replaying the steps would do on this form, without changing anything. */
export function plan(form: FormLike, steps: Step[], options: PlayOptions = {}): PlanItem[] {
  // Hidden columns are left out, so they are "not on this form" as target, copy source and calculation input alike.
  const byName = new Map(form.attributes.filter(isAvailable).map((a) => [a.getName(), a]));
  const items: PlanItem[] = [];
  // Values that earlier steps will set, so a later "copy from column" step sees them instead of the old form value.
  const pending = new Map<string, StoredValue>();

  for (const step of [...steps].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const attr = byName.get(step.column);
    const base = { step, current: null as StoredValue, next: null as StoredValue };

    if (!attr) { items.push({ ...base, status: "skip", reason: "missing" }); continue; }
    const type = attr.getAttributeType();
    if (!isSupportedType(type)) { items.push({ ...base, status: "skip", reason: "unsupported" }); continue; }
    if (type !== step.columnType) { items.push({ ...base, status: "skip", reason: "typeMismatch" }); continue; }

    const current = readValue(attr);
    if (isReadOnly(attr)) { items.push({ ...base, current, status: "skip", reason: "readonly" }); continue; }

    let next: StoredValue;
    if (step.operation === "clear") {
      next = null;
    } else if (step.valueMode === "copy") {
      const src = step.sourceColumn ? byName.get(step.sourceColumn) : undefined;
      if (!src) { items.push({ ...base, current, status: "skip", reason: "sourceMissing" }); continue; }
      if (!isCopyCompatible(columnInfoFromAttr(src), columnInfoFromAttr(attr))) { items.push({ ...base, current, status: "skip", reason: "sourceIncompatible" }); continue; }
      next = step.sourceColumn && pending.has(step.sourceColumn) ? pending.get(step.sourceColumn)! : readValue(src);
    } else if (step.valueMode === "prompt") {
      if (!options.answers || !(step.column in options.answers)) { items.push({ ...base, current, status: "skip", reason: "needsInput" }); continue; }
      next = options.answers[step.column] ?? null;
    } else if (step.valueMode === "calculate") {
      const spec = step.calc;
      if (!spec || calcKindFor(type) !== spec.kind) { items.push({ ...base, current, status: "skip", reason: "calcInvalid" }); continue; }
      const used = calcColumns(spec);
      if (used.some((c) => !byName.has(c))) { items.push({ ...base, current, status: "skip", reason: "sourceMissing" }); continue; }
      if (!calcColumnsUsable(spec, (c) => byName.get(c)!.getAttributeType())) { items.push({ ...base, current, status: "skip", reason: "sourceIncompatible" }); continue; }
      const valueOf = (c: string): StoredValue => (pending.has(c) ? pending.get(c)! : byName.has(c) ? readValue(byName.get(c)!) : null);
      const ctx: CalcContext = {
        now: options.now ?? new Date(),
        userName: options.userName ?? "",
        locale: options.locale,
        target: step.column,
        dateOnly: type === "datetime" && attr.getFormat?.() === "date",
        integer: type === "integer",
        precision: type === "decimal" || type === "money" ? attr.getPrecision?.() : undefined,
        value: valueOf,
        text: (c) => (byName.has(c) ? displayText(byName.get(c)!, valueOf(c)) : ""),
      };
      const res = evaluateCalc(spec, ctx);
      if (!res.ok) { items.push({ ...base, current, status: "skip", reason: res.reason === "inputMissing" ? "calcInputMissing" : "calcInvalid" }); continue; }
      next = res.value;
    } else {
      if (step.value === undefined) { items.push({ ...base, current, status: "skip", reason: "needsInput" }); continue; }
      next = step.value;
    }

    if (!isValueAllowed(attr, next)) { items.push({ ...base, current, status: "skip", reason: "valueNotAllowed" }); continue; }
    pending.set(step.column, next);
    items.push({ step, current, next, status: valuesEqual(current, next) ? "noop" : "apply" });
  }
  return items;
}

export interface ApplyResult {
  applied: string[];
  failed: Array<{ column: string; message: string }>;
}

/** Applies the "apply" items from a plan. The caller saves the form afterwards. */
export function apply(form: FormLike, items: PlanItem[]): ApplyResult {
  const byName = new Map(form.attributes.map((a) => [a.getName(), a]));
  const result: ApplyResult = { applied: [], failed: [] };
  for (const item of items) {
    if (item.status !== "apply") continue;
    const attr = byName.get(item.step.column)!;
    if (!isAvailable(attr)) { result.failed.push({ column: item.step.column, message: t("skipMissing") }); continue; }
    try {
      attr.setValue(toXrmValue(attr, item.next));
      attr.fireOnChange();
      result.applied.push(item.step.column);
    } catch (e) {
      result.failed.push({ column: item.step.column, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return result;
}
