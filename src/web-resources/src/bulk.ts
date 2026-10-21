import type { Api } from "./store";
import { Step, StoredLookup, StoredValue } from "./model";
import { AttrLike, readValue, valuesEqual } from "./value-codec";
import { FormLike } from "./recorder";
import { PlanItem, PlayOptions, plan } from "./player";
import { BulkColumn, TableMeta, entitySetOf } from "./bulk-meta";
import { getRegistry } from "./registry";
import { t } from "./i18n";

/** Records updated at the same time. */
export const CONCURRENCY = 5;

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface BulkRecord {
  id: string;
  name: string;
  etag: string;
  raw: Record<string, any>;
  error?: string;
}

// ---- Values: Web API <-> the form-style values the plan works with ----

const ymd = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hms = (d: Date): string => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A date value as a form would hand it out: date-only columns as local dates, time-zone-independent ones without conversion. */
export function readApiDate(col: BulkColumn, raw: string): Date {
  if (col.behavior === "DateOnly") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(NaN);
  }
  if (col.behavior === "TimeZoneIndependent") {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(raw);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])) : new Date(raw);
  }
  return new Date(raw);
}

/** A stored date (YYYY-MM-DD or an ISO instant) as the Web API wants it for this column. */
export function writeApiDate(col: BulkColumn, stored: string): string {
  const m = DATE_ONLY.exec(stored);
  const local = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(stored);
  if (col.behavior === "DateOnly") return ymd(local);
  if (col.behavior === "TimeZoneIndependent") return `${ymd(local)}T${hms(local)}Z`;
  return local.toISOString();
}

export function decodeValue(col: BulkColumn, raw: Record<string, any>): unknown {
  if (col.type === "lookup") {
    const key = `_${col.name}_value`;
    const id = raw[key];
    if (!id) return null;
    return [{ id, entityType: raw[`${key}@Microsoft.Dynamics.CRM.lookuplogicalname`] ?? col.targets?.[0] ?? "", name: raw[`${key}@OData.Community.Display.V1.FormattedValue`] ?? null }];
  }
  const v = raw[col.name];
  if (v === null || v === undefined || v === "") return null;
  switch (col.type) {
    case "multiselectoptionset": {
      const list = String(v).split(",").filter(Boolean).map(Number);
      return list.length ? list : null;
    }
    case "datetime": return readApiDate(col, String(v));
    default: return v;
  }
}

function toApiValue(col: BulkColumn, value: StoredValue): unknown {
  if (value === null || value === undefined) return null;
  if (col.type === "multiselectoptionset") return (value as number[]).join(",");
  if (col.type === "datetime") return writeApiDate(col, value as string);
  return value;
}

interface VirtualControl {
  getDisabled(): boolean;
  getVisible(): boolean;
  getLabel(): string;
  getEntityTypes(): string[];
}

/** A column of one loaded record, shaped like a form attribute so the existing planner can read it. */
class RecordAttr implements AttrLike {
  private value: unknown;
  private readonly control: VirtualControl;
  readonly controls: { get(): VirtualControl[] };

  constructor(private readonly col: BulkColumn, raw: Record<string, any>) {
    this.value = decodeValue(col, raw);
    this.control = {
      getDisabled: () => false,
      getVisible: () => true,
      getLabel: () => this.col.label,
      getEntityTypes: () => this.col.targets ?? [],
    };
    this.controls = { get: () => [this.control] };
  }

  getName(): string { return this.col.name; }
  getAttributeType(): string { return this.col.type; }
  getValue(): unknown { return this.value; }
  setValue(v: unknown): void { this.value = v; }
  fireOnChange(): void { /* nothing listens in a grid replay */ }
  addOnChange(): void { /* see fireOnChange */ }
  removeOnChange(): void { /* see fireOnChange */ }
  getFormat(): string | null { return this.col.type === "datetime" ? this.col.format : null; }
  getOptions(): Array<{ value: number; text: string }> | undefined { return this.col.options; }
  getMaxLength(): number | undefined { return this.col.maxLength; }
  getMin(): number | undefined { return this.col.min; }
  getMax(): number | undefined { return this.col.max; }
  getPrecision(): number | undefined { return this.col.precision; }
  getUserPrivilege(): { canRead: boolean; canUpdate: boolean; canCreate: boolean } {
    return { canRead: true, canUpdate: this.col.canUpdate, canCreate: false };
  }
}

// ---- Reading and planning ----

export async function loadRecord(api: Api, meta: TableMeta, id: string): Promise<BulkRecord> {
  if (!GUID.test(id)) return { id, name: "", etag: "", raw: {}, error: `Invalid record id: ${id}` };
  const select = new Set<string>([meta.idAttribute]);
  if (meta.nameAttribute) select.add(meta.nameAttribute);
  for (const c of meta.columns.values()) select.add(c.type === "lookup" ? `_${c.name}_value` : c.name);
  try {
    const res = await api.request("GET", `${meta.entitySet}(${id})?$select=${[...select].join(",")}`);
    const raw = res.data as Record<string, any>;
    return { id, name: String(raw[meta.nameAttribute] ?? ""), etag: String(raw["@odata.etag"] ?? ""), raw };
  } catch (e) {
    return { id, name: "", etag: "", raw: {}, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Runs `work` over the items with at most `limit` at a time. */
async function pool<T>(items: T[], limit: number, work: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await work(items[i]!, i);
    }
  });
  await Promise.all(runners);
}

export async function loadRecords(api: Api, meta: TableMeta, ids: string[], onProgress?: (done: number, total: number) => void): Promise<BulkRecord[]> {
  const out: BulkRecord[] = new Array(ids.length);
  let done = 0;
  await pool(ids, CONCURRENCY, async (id, i) => {
    out[i] = await loadRecord(api, meta, id);
    onProgress?.(++done, ids.length);
  });
  return out;
}

/** What replaying the steps would do on one loaded record; nothing is written. */
export function planRecord(meta: TableMeta, rec: BulkRecord, steps: Step[], options: PlayOptions = {}): PlanItem[] {
  const form: FormLike = { entityName: meta.table, attributes: [...meta.columns.values()].map((c) => new RecordAttr(c, rec.raw)) };
  return plan(form, steps, options);
}

export interface ChangeLog {
  column: string;
  type: string;
  before: StoredValue;
  after: StoredValue;
}

/** The changes of a plan, one per column: the first old value and the last new value. */
export function changesFrom(items: PlanItem[]): ChangeLog[] {
  const byColumn = new Map<string, ChangeLog>();
  for (const i of items) {
    if (i.status !== "apply") continue;
    const prev = byColumn.get(i.step.column);
    byColumn.set(i.step.column, { column: i.step.column, type: i.step.columnType, before: prev ? prev.before : i.current, after: i.next });
  }
  return [...byColumn.values()];
}

// ---- Writing ----

function lookupNav(meta: TableMeta, column: string, target: string | undefined): string {
  const nav = target ? meta.navProps.get(`${column}|${target}`) : undefined;
  if (!nav) throw new Error(`No relationship found for ${column}${target ? ` to ${target}` : ""}`);
  return nav;
}

/**
 * Writes the changes of one record. `If-Match` makes the update fail when the record changed since it was read, and
 * keeps PATCH from creating a record that was deleted meanwhile (without it PATCH is an upsert).
 */
export async function writeChanges(api: Api, meta: TableMeta, id: string, changes: ChangeLog[], etag: string): Promise<void> {
  const body: Record<string, unknown> = {};
  const unlink: string[] = [];
  for (const ch of changes) {
    const col = meta.columns.get(ch.column);
    if (!col) throw new Error(`Unknown column ${ch.column}`);
    if (col.type !== "lookup") {
      body[col.name] = toApiValue(col, ch.after);
    } else if (ch.after === null) {
      const before = ch.before as StoredLookup | null;
      unlink.push(lookupNav(meta, col.name, before?.entityType ?? col.targets?.[0]));
    } else {
      const l = ch.after as StoredLookup;
      body[`${lookupNav(meta, col.name, l.entityType)}@odata.bind`] = `/${await entitySetOf(api, meta, l.entityType)}(${l.id})`;
    }
  }
  const path = `${meta.entitySet}(${id})`;
  if (Object.keys(body).length) await api.request("PATCH", path, body, { "If-Match": etag || "*" });
  for (const nav of unlink) await api.request("DELETE", `${path}/${nav}/$ref`);
}

export type OutcomeStatus = "applied" | "unchanged" | "failed" | "conflict" | "notStarted";

export interface Outcome {
  id: string;
  name: string;
  status: OutcomeStatus;
  items: PlanItem[];
  changes: ChangeLog[];
  message?: string;
}

export interface RunControl {
  cancelled: boolean;
  onProgress?: (done: number, total: number) => void;
}

const isConflict = (e: unknown): boolean => e instanceof Error && /^(412|409)\b/.test(e.message);

/** Updates every record that has changes. A failing record never stops the others; cancelling stops starting new ones. */
export async function runBulk(api: Api, meta: TableMeta, records: BulkRecord[], plans: Map<string, PlanItem[]>, ctl: RunControl): Promise<Outcome[]> {
  const out: Outcome[] = new Array(records.length);
  let done = 0;
  await pool(records, CONCURRENCY, async (rec, i) => {
    const items = plans.get(rec.id) ?? [];
    const changes = changesFrom(items);
    const base = { id: rec.id, name: rec.name, items, changes };
    if (rec.error) out[i] = { ...base, status: "failed", message: rec.error, changes: [] };
    else if (ctl.cancelled) out[i] = { ...base, status: "notStarted" };
    else if (changes.length === 0) out[i] = { ...base, status: "unchanged" };
    else {
      try {
        await writeChanges(api, meta, rec.id, changes, rec.etag);
        out[i] = { ...base, status: "applied" };
      } catch (e) {
        out[i] = isConflict(e) ? { ...base, status: "conflict" } : { ...base, status: "failed", message: e instanceof Error ? e.message : String(e) };
      }
    }
    ctl.onProgress?.(++done, records.length);
  });
  return out;
}

/**
 * Puts the old values back for every record a run updated. A column is only restored when it still holds the value
 * the run wrote; a column someone edited since stays as it is and is reported.
 */
export async function undoRun(api: Api, meta: TableMeta, previous: Outcome[], ctl: RunControl): Promise<Outcome[]> {
  const targets = previous.filter((o) => o.status === "applied");
  const out: Outcome[] = new Array(targets.length);
  let done = 0;
  await pool(targets, CONCURRENCY, async (o, i) => {
    const base = { id: o.id, name: o.name, items: [] as PlanItem[] };
    if (ctl.cancelled) { out[i] = { ...base, status: "notStarted", changes: [] }; return; }
    const rec = await loadRecord(api, meta, o.id);
    if (rec.error) { out[i] = { ...base, status: "failed", changes: [], message: rec.error }; return; }
    const attrs = new Map([...meta.columns.values()].map((c) => [c.name, new RecordAttr(c, rec.raw)]));
    const restore: ChangeLog[] = [];
    const kept: string[] = [];
    for (const ch of o.changes) {
      const attr = attrs.get(ch.column);
      if (attr && valuesEqual(readValue(attr), ch.after)) restore.push({ column: ch.column, type: ch.type, before: ch.after, after: ch.before });
      else kept.push(ch.column);
    }
    if (restore.length === 0) { out[i] = { ...base, status: "conflict", changes: [], message: kept.join(", ") }; }
    else {
      try {
        await writeChanges(api, meta, o.id, restore, rec.etag);
        out[i] = { ...base, status: "applied", changes: restore, ...(kept.length ? { message: kept.join(", ") } : {}) };
      } catch (e) {
        out[i] = isConflict(e) ? { ...base, status: "conflict", changes: [] } : { ...base, status: "failed", changes: [], message: e instanceof Error ? e.message : String(e) };
      }
    }
    ctl.onProgress?.(++done, targets.length);
  });
  return out;
}

// ---- Summary for the preview ----

export interface StepSummary {
  column: string;
  apply: number;
  noop: number;
  /** Skipped records per reason. */
  skipped: Record<string, number>;
}

export interface Summary {
  records: number;
  toChange: number;
  nothing: number;
  failedToLoad: number;
  steps: StepSummary[];
}

export function summarize(records: BulkRecord[], plans: Map<string, PlanItem[]>, steps: Step[]): Summary {
  const stepRows = new Map<string, StepSummary>();
  for (const s of [...steps].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (!stepRows.has(s.column)) stepRows.set(s.column, { column: s.column, apply: 0, noop: 0, skipped: {} });
  }
  let toChange = 0;
  let nothing = 0;
  let failedToLoad = 0;
  for (const rec of records) {
    if (rec.error) { failedToLoad++; continue; }
    const items = plans.get(rec.id) ?? [];
    if (items.some((i) => i.status === "apply")) toChange++; else nothing++;
    for (const i of items) {
      const row = stepRows.get(i.step.column);
      if (!row) continue;
      if (i.status === "apply") row.apply++;
      else if (i.status === "noop") row.noop++;
      else row.skipped[i.reason ?? "missing"] = (row.skipped[i.reason ?? "missing"] ?? 0) + 1;
    }
  }
  return { records: records.length, toChange, nothing, failedToLoad, steps: [...stepRows.values()] };
}

// ---- CSV and the remembered run ----

export function displayValue(col: BulkColumn | undefined, value: StoredValue): string {
  if (value === null || value === undefined) return "";
  switch (col?.type) {
    case "lookup": return (value as StoredLookup).name || (value as StoredLookup).id;
    case "optionset": return col.options?.find((o) => o.value === value)?.text ?? String(value);
    case "multiselectoptionset": return (value as number[]).map((v) => col.options?.find((o) => o.value === v)?.text ?? String(v)).join("; ");
    case "boolean": return value === true ? t("yes") : t("no");
    default: return String(value);
  }
}

/** Escapes one CSV cell, and keeps spreadsheets from running text that starts like a formula. */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) && !/^-?\d+([.,]\d+)?$/.test(value) ? `'${value}` : value;
  return /[",;\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: string[][], separator = ";"): string {
  return rows.map((r) => r.map(csvCell).join(separator)).join("\r\n");
}

/** One row per record and column: what the value was, what it became, and what happened. */
export function csvRows(meta: TableMeta, outcomes: Outcome[], resultText: (o: Outcome, item?: PlanItem) => string): string[][] {
  const rows: string[][] = [];
  for (const o of outcomes) {
    if (o.items.length === 0) {
      rows.push([o.name, o.id, "", "", "", resultText(o)]);
      continue;
    }
    for (const item of o.items) {
      const column = meta.columns.get(item.step.column);
      const showsNew = item.status !== "skip";
      rows.push([
        o.name,
        o.id,
        column?.label ?? item.step.column,
        displayValue(column, item.current),
        showsNew ? displayValue(column, item.next) : "",
        resultText(o, item),
      ]);
    }
  }
  return rows;
}

export interface LastRun {
  table: string;
  recording: string;
  at: number;
  outcomes: Outcome[];
}

export function rememberRun(run: LastRun): void {
  (getRegistry().lastRuns ??= {})[run.table] = run;
}

export function lastRunFor(table: string): LastRun | undefined {
  return getRegistry().lastRuns?.[table] as LastRun | undefined;
}

export function forgetRun(table: string): void {
  if (getRegistry().lastRuns) delete getRegistry().lastRuns![table];
}
