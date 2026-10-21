import type { Api } from "./store";

/** What Dataverse says about whether a column can be written. */
export interface AttributeFlags {
  LogicalName: string;
  IsValidForCreate?: boolean;
  IsValidForUpdate?: boolean;
  /** 0 or empty for a normal column; 1 calculated, 2 rollup, 3 formula. */
  SourceType?: number | null;
}

/**
 * A column Replay can never write: the platform fills it in (for example the address composite or a contact's full
 * name) or it is calculated, rolled up or a formula. It still raises a change event when its parts change, so it would
 * otherwise be recorded as a step that cannot be replayed.
 */
export function isNonSettable(a: AttributeFlags): boolean {
  const neverWritable = a.IsValidForCreate === false && a.IsValidForUpdate === false;
  const derived = (a.SourceType ?? 0) !== 0;
  return neverWritable || derived;
}

const cache = new Map<string, Promise<Set<string>>>();

async function fetchNonSettable(api: Api, table: string): Promise<Set<string>> {
  if (!/^[a-z0-9_]+$/i.test(table)) throw new Error(`Invalid table name: ${table}`);
  const res = await api.request("GET", `EntityDefinitions(LogicalName='${table}')/Attributes?$select=LogicalName,IsValidForCreate,IsValidForUpdate,SourceType`);
  return new Set((res.data.value as AttributeFlags[]).filter(isNonSettable).map((a) => a.LogicalName));
}

/**
 * The columns of a table that cannot be written, looked up once per table and page. Never blocks recording: when the
 * lookup fails or takes longer than `timeoutMs`, nothing is left out, which is how recording behaved before.
 */
export async function loadNonSettable(api: Api, table: string, timeoutMs = 10000): Promise<Set<string>> {
  let pending = cache.get(table);
  if (!pending) {
    pending = fetchNonSettable(api, table);
    cache.set(table, pending);
    pending.catch(() => cache.delete(table)); // a failed lookup is retried the next time
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<Set<string>>((resolve) => { timer = setTimeout(() => resolve(new Set()), timeoutMs); });
  try {
    return await Promise.race([pending.catch(() => new Set<string>()), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Forgets the lookups (used by tests). */
export function clearNonSettableCache(): void {
  cache.clear();
}
