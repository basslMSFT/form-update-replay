import type { Api } from "./store";
import { BUILTIN, expand, placeholders } from "./calc";
import { RELATED_TEXT_MAX, RelatedSpec, Step } from "./model";

/** Notes and tasks that a replay adds to a record ("Add note or task" steps). */

export type RelatedKind = RelatedSpec["kind"];

/** A note or task with every placeholder filled in, ready to be created. */
export type ResolvedRelated =
  | { kind: "note"; subject: string; text: string }
  | { kind: "task"; subject: string; description: string; /** Local date, YYYY-MM-DD. */ dueDate: string | null; priority: 0 | 1 | 2 };

export interface ResolveContext {
  now: Date;
  userName: string;
  locale?: string;
  /** Readable text of a column of the record. */
  text(column: string): string;
}

const SUBJECT_MAX = { note: 500, task: 200 } as const;

const ymd = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function relatedKindOf(step: Pick<Step, "column" | "related">): RelatedKind {
  return step.related?.kind ?? (step.column === "task" ? "task" : "note");
}

export function newRelated(kind: RelatedKind): RelatedSpec {
  return kind === "note" ? { kind, subject: "", text: "" } : { kind, subject: "", description: "", dueInDays: 7, priority: 1 };
}

/** Whether the step has enough content to be saved. */
export function relatedValid(spec: RelatedSpec | undefined): boolean {
  if (!spec) return false;
  const body = spec.kind === "note" ? spec.text : spec.description;
  return spec.kind === "task" ? spec.subject.trim() !== "" : spec.subject.trim() !== "" || body.trim() !== "";
}

/** The columns of the record that the texts read through placeholders. */
export function relatedColumns(spec: RelatedSpec): string[] {
  const body = spec.kind === "note" ? spec.text : spec.description;
  const names = new Set<string>();
  for (const n of [...placeholders(spec.subject), ...placeholders(body)]) if (!BUILTIN.includes(n.toLowerCase())) names.add(n);
  return [...names];
}

export function resolveRelated(spec: RelatedSpec, ctx: ResolveContext): ResolvedRelated {
  const subject = expand(spec.subject, ctx).trim().slice(0, SUBJECT_MAX[spec.kind]);
  if (spec.kind === "note") return { kind: "note", subject, text: expand(spec.text, ctx).slice(0, RELATED_TEXT_MAX) };
  let dueDate: string | null = null;
  if (spec.dueInDays !== null && Number.isFinite(spec.dueInDays)) {
    const d = new Date(ctx.now.getTime());
    d.setDate(d.getDate() + Math.trunc(spec.dueInDays));
    dueDate = ymd(d);
  }
  return { kind: "task", subject, description: expand(spec.description, ctx).slice(0, RELATED_TEXT_MAX), dueDate, priority: spec.priority };
}

/** One line that says what will be added, for previews and summaries. */
export function describeResolved(r: ResolvedRelated): string {
  const text = r.kind === "note" ? r.text : r.description;
  return [r.subject, text].filter((x) => x !== "").join(" — ");
}

// ---- Dataverse ----

interface TableFacts {
  set: string;
  notes: boolean;
  tasks: boolean;
}

const facts = new Map<string, Promise<TableFacts | null>>();
const navs = new Map<string, Promise<string | null>>();

/** Entity set name and whether the table can have notes and activities. Null when the metadata cannot be read. */
export function tableFacts(api: Api, table: string): Promise<TableFacts | null> {
  let p = facts.get(table);
  if (!p) {
    p = api
      .request("GET", `EntityDefinitions(LogicalName='${table}')?$select=EntitySetName,HasNotes,HasActivities`)
      .then((r) => ({ set: String(r.data.EntitySetName), notes: r.data.HasNotes === true, tasks: r.data.HasActivities === true }))
      .catch(() => null);
    facts.set(table, p);
  }
  return p;
}

export function clearRelatedCache(): void {
  facts.clear();
  navs.clear();
}

/** Which of notes and tasks the table supports; used to skip such steps with a clear reason. */
export async function relatedSupport(api: Api, table: string): Promise<{ note: boolean; task: boolean }> {
  const f = await tableFacts(api, table);
  // Unknown metadata must not block replay; the server answers for itself when the record is created.
  return f ? { note: f.notes, task: f.tasks } : { note: true, task: true };
}

const CHILD = {
  note: { table: "annotation", set: "annotations", id: "annotationid", lookup: "objectid" },
  task: { table: "task", set: "tasks", id: "activityid", lookup: "regardingobjectid" },
} as const;

function navFor(api: Api, kind: RelatedKind, parent: string): Promise<string | null> {
  const key = `${kind}|${parent}`;
  let p = navs.get(key);
  if (!p) {
    const c = CHILD[kind];
    p = api
      .request("GET", `EntityDefinitions(LogicalName='${c.table}')/ManyToOneRelationships?$select=ReferencingEntityNavigationPropertyName&$filter=ReferencedEntity eq '${parent}' and ReferencingAttribute eq '${c.lookup}'`)
      .then((r) => ((r.data.value as any[])[0]?.ReferencingEntityNavigationPropertyName as string | undefined) ?? null)
      .catch(() => null);
    navs.set(key, p);
  }
  return p;
}

const quote = (s: string): string => `'${s.replace(/'/g, "''")}'`;
const equals = (column: string, value: string): string => (value === "" ? `${column} eq null` : `${column} eq ${quote(value)}`);

/** Whether the record already has the same note (same subject and text) or the same open task (same subject and description). */
export async function existsAlready(api: Api, kind: RelatedKind, parentId: string, r: ResolvedRelated): Promise<boolean> {
  const c = CHILD[kind];
  const filter =
    r.kind === "note"
      ? `_${c.lookup}_value eq ${parentId} and ${equals("subject", r.subject)} and ${equals("notetext", r.text)}`
      : `_${c.lookup}_value eq ${parentId} and statecode eq 0 and ${equals("subject", r.subject)} and ${equals("description", r.description)}`;
  const res = await api.request("GET", `${c.set}?$select=${c.id}&$top=1&$filter=${encodeURIComponent(filter)}`);
  return (res.data.value as unknown[]).length > 0;
}

export interface CreatedRelated {
  set: string;
  id: string;
}

export type CreateResult = { status: "created"; created: CreatedRelated } | { status: "exists" };

/** Creates one note or task on the record, unless an identical one is already there. */
export async function createRelated(api: Api, table: string, parentId: string, r: ResolvedRelated): Promise<CreateResult> {
  const f = await tableFacts(api, table);
  if (!f) throw new Error(`Cannot read the definition of ${table}`);
  if (r.kind === "note" ? !f.notes : !f.tasks) throw new Error(`${table} cannot have ${r.kind === "note" ? "notes" : "tasks"}`);
  const nav = await navFor(api, r.kind, table);
  if (!nav) throw new Error(`No relationship found from ${r.kind} to ${table}`);
  if (await existsAlready(api, r.kind, parentId, r)) return { status: "exists" };
  const c = CHILD[r.kind];
  const bind = { [`${nav}@odata.bind`]: `/${f.set}(${parentId})` };
  const body =
    r.kind === "note"
      ? { subject: r.subject || null, notetext: r.text || null, ...bind }
      : { subject: r.subject, description: r.description || null, prioritycode: r.priority, ...(r.dueDate ? { scheduledend: r.dueDate } : {}), ...bind };
  const res = await api.request("POST", c.set, body, { Prefer: "return=representation" });
  return { status: "created", created: { set: c.set, id: String(res.data[c.id]).replace(/[{}]/g, "").toLowerCase() } };
}

/** Deletes records this tool created. A record that is already gone counts as removed. */
export async function deleteCreated(api: Api, list: CreatedRelated[]): Promise<{ removed: number; failed: string[] }> {
  let removed = 0;
  const failed: string[] = [];
  for (const c of list) {
    try {
      await api.request("DELETE", `${c.set}(${c.id})`);
      removed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/^404\b/.test(msg)) removed++;
      else failed.push(msg);
    }
  }
  return { removed, failed };
}

// ---- Capture while recording ----

export interface RelatedSnapshot {
  notes: Set<string>;
  tasks: Set<string>;
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function listIds(api: Api, kind: RelatedKind, parentId: string): Promise<Set<string>> {
  const c = CHILD[kind];
  const res = await api.request("GET", `${c.set}?$select=${c.id}&$top=500&$filter=${encodeURIComponent(`_${c.lookup}_value eq ${parentId}`)}`);
  return new Set((res.data.value as any[]).map((x) => String(x[c.id]).toLowerCase()));
}

/** The notes and tasks that a record has now; compared with a later snapshot to find what the user added. */
export async function snapshotRelated(api: Api, parentId: string): Promise<RelatedSnapshot> {
  if (!GUID.test(parentId)) return { notes: new Set(), tasks: new Set() };
  const [notes, tasks] = await Promise.all([listIds(api, "note", parentId).catch(() => new Set<string>()), listIds(api, "task", parentId).catch(() => new Set<string>())]);
  return { notes, tasks };
}

/** Notes (without attachments) and tasks the signed-in user added since the snapshot, oldest first. */
export async function capturedSince(api: Api, parentId: string, before: RelatedSnapshot, userId: string): Promise<RelatedSpec[]> {
  if (!GUID.test(parentId)) return [];
  const me = userId.replace(/[{}]/g, "").toLowerCase();
  const out: RelatedSpec[] = [];
  const [notes, tasks] = await Promise.all([
    api
      .request("GET", `annotations?$select=annotationid,subject,notetext,isdocument&$top=100&$orderby=createdon asc&$filter=${encodeURIComponent(`_objectid_value eq ${parentId} and _createdby_value eq ${me}`)}`)
      .then((r) => r.data.value as any[])
      .catch(() => [] as any[]),
    api
      .request("GET", `tasks?$select=activityid,subject,description,scheduledend,prioritycode,createdon&$top=100&$orderby=createdon asc&$filter=${encodeURIComponent(`_regardingobjectid_value eq ${parentId} and _createdby_value eq ${me}`)}`)
      .then((r) => r.data.value as any[])
      .catch(() => [] as any[]),
  ]);
  for (const n of notes) {
    if (before.notes.has(String(n.annotationid).toLowerCase()) || n.isdocument) continue;
    out.push({ kind: "note", subject: plainText(String(n.subject ?? "")), text: plainText(String(n.notetext ?? "")).slice(0, RELATED_TEXT_MAX) });
  }
  for (const k of tasks) {
    if (before.tasks.has(String(k.activityid).toLowerCase())) continue;
    out.push({
      kind: "task",
      subject: String(k.subject ?? ""),
      description: plainText(String(k.description ?? "")).slice(0, RELATED_TEXT_MAX),
      dueInDays: dueInDays(k.scheduledend),
      priority: k.prioritycode === 0 || k.prioritycode === 2 ? k.prioritycode : 1,
    });
  }
  return out;
}

/** The timeline stores notes written in its editor as HTML; a recorded note keeps only the text. */
export function plainText(html: string): string {
  if (!/<[a-z!/][^>]*>/i.test(html)) return html;
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Whole days from today to a due date, so a recorded task keeps its distance from "now" instead of a date in the past. */
function dueInDays(due: unknown, now: Date = new Date()): number | null {
  if (typeof due !== "string" || due === "") return null;
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return null;
  const a = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / 86400000);
}
