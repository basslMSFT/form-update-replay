import { FormEntry, getRegistry, toFormLike } from "./registry";
import { Recorder } from "./recorder";
import { Step, StoredLookup, StoredValue } from "./model";
import { t } from "./i18n";

export function getXrm(): typeof Xrm {
  for (const w of [window, window.parent, window.top] as Array<Window | null>) {
    try {
      const x = (w as unknown as { Xrm?: typeof Xrm } | null)?.Xrm;
      if (x) return x;
    } catch {
      // cross-origin parent; try the next one
    }
  }
  throw new Error("Xrm is not available");
}

const NOTIFICATION_ID = "bassllab_furep_recording";

/** True while the native record picker is open; the form is not the current page then, which must not reset the pane. */
export const picker = { active: false };

export function isRecording(entry: FormEntry): boolean {
  return getRegistry().recorders[entry.key]?.isRecording ?? false;
}

export function recordedCount(entry: FormEntry): number {
  return getRegistry().recorders[entry.key]?.snapshot().length ?? 0;
}

export function startRecording(entry: FormEntry, skip: ReadonlySet<string> = new Set()): void {
  const reg = getRegistry();
  const rec = (reg.recorders[entry.key] ??= new Recorder());
  rec.start(toFormLike(entry.fc), skip);
  entry.fc.ui.setFormNotification(t("formRecording"), "INFO", NOTIFICATION_ID);
}

/** Columns the last recording left out because the platform fills them in itself. */
export function leftOutColumns(entry: FormEntry): string[] {
  return getRegistry().recorders[entry.key]?.leftOut() ?? [];
}

export async function stopRecording(entry: FormEntry): Promise<Step[]> {
  const rec = getRegistry().recorders[entry.key];
  entry.fc.ui.clearFormNotification(NOTIFICATION_ID);
  if (!rec) return [];
  return resolveLookupNames(rec.stop());
}

export function discardRecording(entry: FormEntry): void {
  getRegistry().recorders[entry.key]?.stop();
  entry.fc.ui.clearFormNotification(NOTIFICATION_ID);
}

/** Lookup values on forms often carry no display name; fetch it so the review and preview are readable. */
export async function resolveLookupNames(steps: Step[]): Promise<Step[]> {
  const x = getXrm();
  const primaryName = new Map<string, string>();
  for (const s of steps) {
    const v = s.value as StoredLookup | undefined;
    if (s.columnType !== "lookup" || !v || typeof v !== "object" || Array.isArray(v) || v.name) continue;
    try {
      if (!primaryName.has(v.entityType)) {
        const md = await x.Utility.getEntityMetadata(v.entityType, []);
        primaryName.set(v.entityType, (md as unknown as { PrimaryNameAttribute: string }).PrimaryNameAttribute);
      }
      const col = primaryName.get(v.entityType)!;
      const rec = await x.WebApi.retrieveRecord(v.entityType, v.id, `?$select=${col}`);
      const name = (rec as Record<string, unknown>)[col];
      if (typeof name === "string") s.value = { ...v, name };
    } catch {
      // keep the id only; the step still replays correctly
    }
  }
  return steps;
}

type OptionAttr = { getOptions(): Array<{ value: number; text: string }> };

export function labelFor(fc: Xrm.FormContext | undefined, column: string, labels?: Record<string, string>): string {
  const fromForm = fc?.getAttribute(column)?.controls.get(0)?.getLabel();
  return fromForm || labels?.[column] || column;
}

export function describeValue(
  fc: Xrm.FormContext | undefined,
  step: Pick<Step, "column" | "columnType">,
  value: StoredValue | undefined,
  optionLabels?: Record<string, Record<string, string>>,
): string {
  if (value === null || value === undefined || value === "") return t("emptyValue");
  const attr = fc?.getAttribute(step.column) as unknown as (OptionAttr & { getAttributeType(): string }) | undefined;
  const fromMetadata = (v: unknown): string | undefined => optionLabels?.[step.column]?.[String(v)];
  switch (step.columnType) {
    case "optionset":
    case "boolean": {
      const opt = attr?.getOptions?.().find((o) => o.value === (value as unknown as number) || (typeof value === "boolean" && o.value === (value ? 1 : 0)));
      return opt?.text ?? fromMetadata(value) ?? String(value);
    }
    case "multiselectoptionset": {
      const opts = attr?.getOptions?.() ?? [];
      return (value as number[]).map((v) => opts.find((o) => o.value === v)?.text ?? fromMetadata(v) ?? String(v)).join(", ");
    }
    case "lookup": {
      const l = value as StoredLookup;
      return l.name ?? l.id;
    }
    case "datetime": {
      const s = String(value);
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`).toLocaleDateString() : new Date(s).toLocaleString();
    }
    case "integer":
    case "decimal":
    case "double":
    case "money":
      return typeof value === "number" ? value.toLocaleString(undefined, { maximumFractionDigits: 10 }) : String(value);
    default:
      return String(value);
  }
}
