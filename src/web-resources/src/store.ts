import { OPTION, Recording, Step, StoredValue } from "./model";
import type { CalcSpec } from "./calc";

/** Thin HTTP layer so the store can be unit tested without a browser. */
export interface Api {
  request(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<{ data: any; headers: Headers | { get(name: string): string | null } }>;
}

export function createApi(clientUrl: string): Api {
  return {
    async request(method, path, body, headers = {}) {
      const url = path.startsWith("http") ? path : `${clientUrl}/api/data/v9.2/${path}`;
      const res = await fetch(url, {
        method,
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json; charset=utf-8",
          "OData-MaxVersion": "4.0",
          "OData-Version": "4.0",
          Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue,Microsoft.Dynamics.CRM.lookuplogicalname"',
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      let data: any = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      if (!res.ok) {
        const msg = (data && data.error && data.error.message) || (typeof data === "string" ? data : res.statusText);
        throw new Error(`${res.status}: ${msg}`);
      }
      return { data, headers: res.headers };
    },
  };
}

export const SET = "bassllab_updaterecordings";
const STEP_NAV = "bassllab_updaterecording_updaterecordingstep";

export interface RecordingRow {
  id: string;
  name: string;
  description: string;
  table: string;
  stepCount: number;
  ownerId: string;
  ownerType: "systemuser" | "team";
  ownerName: string;
  modifiedOn: string;
  /** Number of users and teams the recording is shared with; undefined when sharing information is not available. */
  sharedCount?: number;
}

export type Scope = "mine" | "sharedby" | "shared" | "team" | "all";

export interface Identity {
  userId: string;
  teamIds: string[];
  isAdmin: boolean;
}

const bare = (id: string): string => id.replace(/[{}]/g, "").toLowerCase();

const optionToOp = (v: number): Step["operation"] => (v === OPTION.operation.clear ? "clear" : "set");
const optionToMode = (v: number): Step["valueMode"] =>
  v === OPTION.valueMode.copy ? "copy" : v === OPTION.valueMode.prompt ? "prompt" : v === OPTION.valueMode.calculate ? "calculate" : "fixed";

export function stepToPayload(step: Step): Record<string, unknown> {
  const label = step.operation === "clear" ? "Clear" : "Set";
  return {
    bassllab_name: `${label} ${step.column}`.slice(0, 200),
    bassllab_sortorder: step.sortOrder,
    bassllab_operation: OPTION.operation[step.operation],
    bassllab_valuemode: OPTION.valueMode[step.valueMode],
    bassllab_columnlogicalname: step.column,
    bassllab_columntype: step.columnType,
    // Only fixed values are stored; "ask" and "copy" steps must not keep a recorded value (it may be sensitive).
    bassllab_value: step.valueMode !== "fixed" || step.operation === "clear" || step.value === undefined ? null : JSON.stringify(step.value),
    bassllab_sourcecolumnlogicalname: step.valueMode === "copy" ? step.sourceColumn ?? null : null,
    bassllab_prompttext: step.valueMode === "prompt" ? step.promptText ?? null : null,
    bassllab_calculation: step.valueMode === "calculate" && step.calc ? JSON.stringify(step.calc) : null,
  };
}

export function stepFromRow(row: any): Step {
  let value: StoredValue | undefined;
  if (row.bassllab_value) {
    try { value = JSON.parse(row.bassllab_value) as StoredValue; } catch { value = row.bassllab_value as string; }
  }
  const step: Step = {
    sortOrder: row.bassllab_sortorder,
    operation: optionToOp(row.bassllab_operation),
    valueMode: optionToMode(row.bassllab_valuemode),
    column: row.bassllab_columnlogicalname,
    columnType: row.bassllab_columntype ?? "",
  };
  if (value !== undefined) step.value = value;
  if (row.bassllab_sourcecolumnlogicalname) step.sourceColumn = row.bassllab_sourcecolumnlogicalname;
  if (row.bassllab_prompttext) step.promptText = row.bassllab_prompttext;
  if (row.bassllab_calculation) {
    try { step.calc = JSON.parse(row.bassllab_calculation) as CalcSpec; } catch { /* a damaged calculation leaves the step without one; replay skips it */ }
  }
  return step;
}

export function recordingToPayload(rec: Recording): Record<string, unknown> {
  return {
    bassllab_name: rec.name,
    bassllab_description: rec.description ?? null,
    bassllab_tablelogicalname: rec.table,
    bassllab_schemaversion: 1,
    [STEP_NAV]: rec.steps.map(stepToPayload),
  };
}

function rowFromRecord(r: any): RecordingRow {
  const ownerId = bare(r._ownerid_value ?? "");
  const ownerType = r["_ownerid_value@Microsoft.Dynamics.CRM.lookuplogicalname"] === "team" ? "team" : "systemuser";
  return {
    id: bare(r.bassllab_updaterecordingid),
    name: r.bassllab_name ?? "",
    description: r.bassllab_description ?? "",
    table: r.bassllab_tablelogicalname ?? "",
    stepCount: Array.isArray(r[STEP_NAV]) ? r[STEP_NAV].length : 0,
    ownerId,
    ownerType,
    ownerName: r["_ownerid_value@OData.Community.Display.V1.FormattedValue"] ?? "",
    modifiedOn: r.modifiedon ?? "",
  };
}

async function readAll(api: Api, path: string): Promise<any[]> {
  const out: any[] = [];
  let next: string | undefined = path;
  while (next) {
    const res = await api.request("GET", next, undefined, { Prefer: 'odata.maxpagesize=250, odata.include-annotations="OData.Community.Display.V1.FormattedValue,Microsoft.Dynamics.CRM.lookuplogicalname"' });
    out.push(...(res.data.value as any[]));
    next = res.data["@odata.nextLink"];
  }
  return out;
}

interface ShareEntryRaw {
  type: "systemuser" | "team";
  mask: number;
}

/** Who each recording is shared with, as recordingId -> principalId -> access. Null when the sharing table cannot be read. */
async function loadShareMap(api: Api): Promise<Map<string, Map<string, ShareEntryRaw>> | null> {
  try {
    const rows = await readAll(api, "principalobjectaccessset?$select=objectid,principalid,principaltypecode,accessrightsmask&$filter=objecttypecode eq 'bassllab_updaterecording'");
    const map = new Map<string, Map<string, ShareEntryRaw>>();
    for (const r of rows) {
      const k = bare(r.objectid);
      if (!map.has(k)) map.set(k, new Map());
      map.get(k)!.set(bare(r.principalid), { type: r.principaltypecode === "team" ? "team" : "systemuser", mask: Number(r.accessrightsmask ?? 1) });
    }
    return map;
  } catch {
    // Without sharing information rows fall back to owner-based placement and the shared column stays empty.
    return null;
  }
}

export function classify(row: RecordingRow, who: Identity, sharedWith: Map<string, Set<string>>): Exclude<Scope, "all" | "sharedby"> {
  if (row.ownerType === "systemuser" && row.ownerId === who.userId) return "mine";
  if (row.ownerType === "team" && who.teamIds.includes(row.ownerId)) return "team";
  const shares = sharedWith.get(row.id);
  if (shares && who.teamIds.some((t) => shares.has(t))) return "team";
  return "shared";
}

export async function listRecordings(api: Api, who: Identity, scope: Scope): Promise<RecordingRow[]> {
  const raw = await readAll(
    api,
    `${SET}?$select=bassllab_name,bassllab_description,bassllab_tablelogicalname,modifiedon,_ownerid_value&$expand=${STEP_NAV}($select=bassllab_updaterecordingstepid)&$orderby=modifiedon desc`,
  );
  const rows = raw.map(rowFromRecord);
  const shares = await loadShareMap(api);
  const principalsByRecording = new Map<string, Set<string>>();
  for (const row of rows) {
    const entries = shares?.get(row.id);
    const ids = new Set(entries ? [...entries.keys()].filter((p) => p !== row.ownerId) : []);
    principalsByRecording.set(row.id, ids);
    if (shares) row.sharedCount = ids.size;
  }
  if (scope === "all") return rows;
  if (scope === "sharedby") return rows.filter((r) => r.ownerType === "systemuser" && r.ownerId === who.userId && (r.sharedCount ?? 0) > 0);
  return rows.filter((r) => classify(r, who, principalsByRecording) === scope);
}

export interface ShareEntry {
  principal: Principal;
  canWrite: boolean;
}

/** The users and teams a recording is shared with (the owner is not listed). */
export async function getShares(api: Api, recordingId: string, ownerId: string): Promise<ShareEntry[]> {
  const rows = await readAll(api, `principalobjectaccessset?$select=principalid,principaltypecode,accessrightsmask&$filter=objectid eq ${recordingId}`);
  const entries = rows
    .map((r) => ({ id: bare(r.principalid), type: (r.principaltypecode === "team" ? "team" : "systemuser") as Principal["type"], mask: Number(r.accessrightsmask ?? 1) }))
    .filter((e) => e.id !== ownerId);
  const users = entries.filter((e) => e.type === "systemuser").map((e) => e.id);
  const teams = entries.filter((e) => e.type === "team").map((e) => e.id);
  const names = new Map<string, string>();
  if (users.length) {
    for (const u of await readAll(api, `systemusers?$select=systemuserid,fullname&$filter=${users.map((i) => `systemuserid eq ${i}`).join(" or ")}`)) names.set(bare(u.systemuserid), u.fullname);
  }
  if (teams.length) {
    for (const t of await readAll(api, `teams?$select=teamid,name&$filter=${teams.map((i) => `teamid eq ${i}`).join(" or ")}`)) names.set(bare(t.teamid), t.name);
  }
  return entries
    .map((e) => ({ principal: { id: e.id, type: e.type, name: names.get(e.id) ?? e.id }, canWrite: (e.mask & 2) === 2 }))
    .sort((a, b) => a.principal.name.localeCompare(b.principal.name));
}

export async function revokeAccess(api: Api, recordingId: string, principal: Principal): Promise<void> {
  await api.request("POST", "RevokeAccess", {
    Target: { "@odata.type": "Microsoft.Dynamics.CRM.bassllab_updaterecording", bassllab_updaterecordingid: recordingId },
    Revokee:
      principal.type === "team"
        ? { "@odata.type": "Microsoft.Dynamics.CRM.team", teamid: principal.id }
        : { "@odata.type": "Microsoft.Dynamics.CRM.systemuser", systemuserid: principal.id },
  });
}

export async function getRecording(api: Api, id: string): Promise<{ row: RecordingRow; steps: Step[] }> {
  const res = await api.request(
    "GET",
    `${SET}(${id})?$select=bassllab_name,bassllab_description,bassllab_tablelogicalname,modifiedon,_ownerid_value&$expand=${STEP_NAV}($orderby=bassllab_sortorder asc)`,
  );
  const steps = ((res.data[STEP_NAV] ?? []) as any[]).map(stepFromRow).sort((a, b) => a.sortOrder - b.sortOrder);
  return { row: rowFromRecord(res.data), steps };
}

export async function createRecording(api: Api, rec: Recording): Promise<string> {
  const res = await api.request("POST", SET, recordingToPayload(rec), { Prefer: "return=representation" });
  return bare(res.data.bassllab_updaterecordingid);
}

export async function updateRecordingHeader(api: Api, id: string, fields: { name?: string; description?: string }): Promise<void> {
  const body: Record<string, unknown> = {};
  if (fields.name !== undefined) body.bassllab_name = fields.name;
  if (fields.description !== undefined) body.bassllab_description = fields.description;
  await api.request("PATCH", `${SET}(${id})`, body);
}

/** Replaces all steps of a recording. The new rows are created first, so a failure never leaves the recording without steps. */
export async function replaceSteps(api: Api, id: string, steps: Step[]): Promise<void> {
  const old = await readAll(api, `bassllab_updaterecordingsteps?$select=bassllab_updaterecordingstepid&$filter=_bassllab_recordingid_value eq ${id}`);
  const created: string[] = [];
  try {
    for (const s of steps) {
      const res = await api.request(
        "POST",
        "bassllab_updaterecordingsteps",
        { ...stepToPayload(s), "bassllab_RecordingId@odata.bind": `/${SET}(${id})` },
        { Prefer: "return=representation" },
      );
      created.push(bare(res.data.bassllab_updaterecordingstepid));
    }
  } catch (e) {
    for (const c of created) await api.request("DELETE", `bassllab_updaterecordingsteps(${c})`).catch(() => undefined);
    throw e;
  }
  for (const o of old) await api.request("DELETE", `bassllab_updaterecordingsteps(${bare(o.bassllab_updaterecordingstepid)})`);
}

export async function deleteRecording(api: Api, id: string): Promise<void> {
  await api.request("DELETE", `${SET}(${id})`);
}

export interface Principal {
  id: string;
  type: "systemuser" | "team";
  name: string;
}

export async function searchPrincipals(api: Api, text: string, ownerTeamsOnly = false): Promise<Principal[]> {
  // Quotes are doubled for OData; the whole value is URL-encoded so typed characters can never add query options.
  const q = encodeURIComponent(text.replace(/'/g, "''"));
  const teamType = ownerTeamsOnly ? "teamtype eq 0" : "(teamtype eq 0 or teamtype eq 1)";
  const [users, teams] = await Promise.all([
    ownerTeamsOnly ? Promise.resolve({ data: { value: [] as any[] } }) : api.request("GET", `systemusers?$select=systemuserid,fullname&$filter=isdisabled eq false and contains(fullname,'${q}')&$top=10`),
    api.request("GET", `teams?$select=teamid,name&$filter=contains(name,'${q}') and ${teamType}&$top=10`),
  ]);
  return [
    ...(users.data.value as any[]).map((u): Principal => ({ id: bare(u.systemuserid), type: "systemuser", name: u.fullname })),
    ...(teams.data.value as any[]).map((t): Principal => ({ id: bare(t.teamid), type: "team", name: t.name })),
  ];
}

export async function grantAccess(api: Api, recordingId: string, principal: Principal, canWrite: boolean): Promise<void> {
  await api.request("POST", "GrantAccess", {
    Target: { "@odata.type": "Microsoft.Dynamics.CRM.bassllab_updaterecording", bassllab_updaterecordingid: recordingId },
    PrincipalAccess: {
      Principal:
        principal.type === "team"
          ? { "@odata.type": "Microsoft.Dynamics.CRM.team", teamid: principal.id }
          : { "@odata.type": "Microsoft.Dynamics.CRM.systemuser", systemuserid: principal.id },
      AccessMask: canWrite ? "ReadAccess, WriteAccess, AppendAccess, AppendToAccess" : "ReadAccess",
    },
  });
}

export async function assignToTeam(api: Api, recordingId: string, teamId: string): Promise<void> {
  await api.request("PATCH", `${SET}(${recordingId})`, { "ownerid@odata.bind": `/teams(${teamId})` });
}

export async function loadIdentity(api: Api, userId: string, roleNames: string[]): Promise<Identity> {
  const teamIds = await loadTeamIds(api, userId);
  const isAdmin = roleNames.some((n) => n === "Form Update Replay Admin" || n === "System Administrator");
  return { userId: bare(userId), teamIds, isAdmin };
}

export async function loadTeamIds(api: Api, userId: string): Promise<string[]> {
  const res = await api.request("GET", `systemusers(${bare(userId)})/teammembership_association?$select=teamid`);
  return (res.data.value as any[]).map((t) => bare(t.teamid));
}
