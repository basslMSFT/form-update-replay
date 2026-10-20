import type { Api } from "./store";
import type { Step } from "./model";
import { calcColumns } from "./calc";
import { TYPE_BY_METADATA } from "./compat";

/** What a grid replay needs to know about a column, taken from table metadata instead of an open form. */
export interface BulkColumn {
  name: string;
  label: string;
  type: string;
  /** "date" for date-only columns; "datetime" otherwise. Only set for datetime columns. */
  format: "date" | "datetime" | null;
  behavior: "DateOnly" | "UserLocal" | "TimeZoneIndependent" | null;
  options?: Array<{ value: number; text: string }>;
  targets?: string[];
  maxLength?: number;
  min?: number;
  max?: number;
  precision?: number;
  canUpdate: boolean;
}

export interface TableMeta {
  table: string;
  entitySet: string;
  idAttribute: string;
  nameAttribute: string;
  columns: Map<string, BulkColumn>;
  /** "attribute|target table" to the navigation property that `@odata.bind` needs. */
  navProps: Map<string, string>;
  /** Entity set names of lookup target tables, filled on demand. */
  entitySets: Map<string, string>;
}

/** Every column a recording touches: the target columns plus the columns it copies from or calculates with. */
export function neededColumns(steps: Step[]): string[] {
  const out = new Set<string>();
  for (const s of steps) {
    out.add(s.column);
    if (s.sourceColumn) out.add(s.sourceColumn);
    if (s.calc) for (const c of calcColumns(s.calc)) out.add(c);
  }
  return [...out];
}

function validName(table: string): string {
  if (!/^[a-z0-9_]+$/i.test(table)) throw new Error(`Invalid table name: ${table}`);
  return table;
}

const labelOf = (o: any): string => o?.Label?.UserLocalizedLabel?.Label ?? o?.Label?.LocalizedLabels?.[0]?.Label ?? String(o?.Value ?? "");

export async function loadTableMeta(api: Api, table: string, needed: string[]): Promise<TableMeta> {
  const base = `EntityDefinitions(LogicalName='${validName(table)}')`;
  const [def, attrs] = await Promise.all([
    api.request("GET", `${base}?$select=EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute`),
    api.request("GET", `${base}/Attributes?$select=LogicalName,AttributeTypeName,DisplayName,IsValidForRead,IsValidForUpdate,AttributeOf`),
  ]);

  const wanted = new Set(needed);
  const columns = new Map<string, BulkColumn>();
  for (const a of attrs.data.value as any[]) {
    const type = TYPE_BY_METADATA[a.AttributeTypeName?.Value as string];
    if (!type || !wanted.has(a.LogicalName) || a.AttributeOf || a.IsValidForRead === false) continue;
    columns.set(a.LogicalName, {
      name: a.LogicalName,
      label: a.DisplayName?.UserLocalizedLabel?.Label || a.LogicalName,
      type,
      format: null,
      behavior: null,
      canUpdate: a.IsValidForUpdate !== false,
    });
  }

  const present = (type: string): boolean => [...columns.values()].some((c) => c.type === type);
  // A detail request that fails leaves those limits unknown; the server still validates every value when it is written.
  const detail = async (cast: string, query: string, use: (c: BulkColumn, row: any) => void): Promise<void> => {
    try {
      const r = await api.request("GET", `${base}/Attributes/Microsoft.Dynamics.CRM.${cast}?${query}`);
      for (const row of r.data.value as any[]) {
        const c = columns.get(row.LogicalName);
        if (c) use(c, row);
      }
    } catch {
      /* see above */
    }
  };
  const choices = "$select=LogicalName&$expand=OptionSet($select=Options),GlobalOptionSet($select=Options)";
  const setOptions = (c: BulkColumn, row: any): void => {
    const list = (row.OptionSet?.Options ?? row.GlobalOptionSet?.Options) as any[] | undefined;
    if (list) c.options = list.map((o) => ({ value: Number(o.Value), text: labelOf(o) }));
  };
  const range = (c: BulkColumn, row: any): void => {
    if (typeof row.MinValue === "number") c.min = row.MinValue;
    if (typeof row.MaxValue === "number") c.max = row.MaxValue;
    if (typeof row.Precision === "number") c.precision = row.Precision;
  };
  const jobs: Array<Promise<void>> = [];
  if (present("optionset")) {
    for (const cast of ["PicklistAttributeMetadata", "StateAttributeMetadata", "StatusAttributeMetadata"]) jobs.push(detail(cast, choices, setOptions));
  }
  if (present("multiselectoptionset")) jobs.push(detail("MultiSelectPicklistAttributeMetadata", choices, setOptions));
  if (present("string")) jobs.push(detail("StringAttributeMetadata", "$select=LogicalName,MaxLength", (c, r) => { c.maxLength = r.MaxLength; }));
  if (present("memo")) jobs.push(detail("MemoAttributeMetadata", "$select=LogicalName,MaxLength", (c, r) => { c.maxLength = r.MaxLength; }));
  if (present("integer")) jobs.push(detail("IntegerAttributeMetadata", "$select=LogicalName,MinValue,MaxValue", range));
  if (present("decimal")) jobs.push(detail("DecimalAttributeMetadata", "$select=LogicalName,MinValue,MaxValue,Precision", range));
  if (present("double")) jobs.push(detail("DoubleAttributeMetadata", "$select=LogicalName,MinValue,MaxValue,Precision", range));
  if (present("money")) jobs.push(detail("MoneyAttributeMetadata", "$select=LogicalName,MinValue,MaxValue,Precision", range));
  if (present("lookup")) jobs.push(detail("LookupAttributeMetadata", "$select=LogicalName,Targets", (c, r) => { c.targets = r.Targets ?? []; }));
  if (present("datetime")) {
    jobs.push(detail("DateTimeAttributeMetadata", "$select=LogicalName,Format,DateTimeBehavior", (c, r) => {
      c.format = r.Format === "DateOnly" ? "date" : "datetime";
      c.behavior = (r.DateTimeBehavior?.Value as BulkColumn["behavior"]) ?? "UserLocal";
    }));
  }

  const navProps = new Map<string, string>();
  if (present("lookup")) {
    jobs.push((async () => {
      try {
        const r = await api.request("GET", `${base}/ManyToOneRelationships?$select=ReferencingAttribute,ReferencedEntity,ReferencingEntityNavigationPropertyName`);
        for (const rel of r.data.value as any[]) navProps.set(`${rel.ReferencingAttribute}|${rel.ReferencedEntity}`, rel.ReferencingEntityNavigationPropertyName);
      } catch {
        /* lookups cannot be written without these names; the affected records report an error */
      }
    })());
  }
  await Promise.all(jobs);

  return {
    table,
    entitySet: def.data.EntitySetName,
    idAttribute: def.data.PrimaryIdAttribute,
    nameAttribute: def.data.PrimaryNameAttribute ?? "",
    columns,
    navProps,
    entitySets: new Map(),
  };
}

/** The entity set name of a lookup target table, looked up once. */
export async function entitySetOf(api: Api, meta: TableMeta, table: string): Promise<string> {
  const known = meta.entitySets.get(table);
  if (known) return known;
  const r = await api.request("GET", `EntityDefinitions(LogicalName='${validName(table)}')?$select=EntitySetName`);
  meta.entitySets.set(table, r.data.EntitySetName);
  return r.data.EntitySetName as string;
}
