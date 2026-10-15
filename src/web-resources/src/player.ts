import { FormLike } from "./recorder";
import { AttrLike, readValue, toXrmValue, valuesEqual } from "./value-codec";
import { Step, StoredValue, isSupportedType } from "./model";
import { columnInfoFromAttr, isCopyCompatible, isValueAllowed } from "./compat";

export type SkipReason = "missing" | "readonly" | "unsupported" | "typeMismatch" | "needsInput" | "sourceMissing" | "sourceIncompatible" | "valueNotAllowed";

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
}

function isReadOnly(attr: AttrLike): boolean {
  const priv = attr.getUserPrivilege?.();
  if (priv && !priv.canUpdate && !priv.canCreate) return true;
  const controls = attr.controls?.get() ?? [];
  if (controls.length === 0) return true;
  return controls.every((c) => c.getDisabled?.() === true);
}

/** Works out what replaying the steps would do on this form, without changing anything. */
export function plan(form: FormLike, steps: Step[], options: PlayOptions = {}): PlanItem[] {
  const byName = new Map(form.attributes.map((a) => [a.getName(), a]));
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
