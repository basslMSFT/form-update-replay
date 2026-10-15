import { StoredLookup, StoredValue, isSupportedType } from "./model";
import { AttrLike } from "./value-codec";
import type { Api } from "./store";

/** What the engine and the editor need to know about a column to decide which values it can take. */
export interface ColumnInfo {
  name: string;
  label: string;
  type: string;
  /** "date" or "datetime" for date columns. */
  format?: string | null;
  /** Identifies the list of choices: the global option set name from metadata, or the values and labels read from a form. */
  optionKey?: string;
  /** Tables a lookup can point to. */
  targets?: string[];
}

const NUMERIC_WIDENING: Record<string, string[]> = {
  integer: ["integer", "decimal", "double", "money"],
  decimal: ["decimal", "double"],
  double: ["double"],
  money: ["money"],
};

/**
 * A column may only be copied into another one when every value of the source is a valid value of the target:
 * same type (or a lossless widening), the same list of choices, an overlapping lookup target, the same date format.
 */
export function isCopyCompatible(src: ColumnInfo, dst: ColumnInfo): boolean {
  if (src.name === dst.name) return false;
  if (!isSupportedType(src.type) || !isSupportedType(dst.type)) return false;
  if (src.type === "string") return dst.type === "string" || dst.type === "memo";
  if (src.type in NUMERIC_WIDENING) return NUMERIC_WIDENING[src.type]!.includes(dst.type);
  if (src.type !== dst.type) return false;
  switch (src.type) {
    case "optionset":
    case "multiselectoptionset":
      return !!src.optionKey && src.optionKey === dst.optionKey;
    case "lookup":
      return !!src.targets?.some((x) => dst.targets?.includes(x));
    case "datetime":
      return !!src.format && src.format === dst.format;
    default:
      return true;
  }
}

export function copyCandidates(target: ColumnInfo | undefined, all: ColumnInfo[]): ColumnInfo[] {
  if (!target) return [];
  return all.filter((c) => isCopyCompatible(c, target)).sort((a, b) => a.label.localeCompare(b.label));
}

/** Reads the type, label, choices and lookup targets of a column from a form attribute. */
export function columnInfoFromAttr(attr: AttrLike): ColumnInfo {
  const type = attr.getAttributeType();
  const control = attr.controls?.get()[0];
  const info: ColumnInfo = { name: attr.getName(), label: control?.getLabel?.() || attr.getName(), type };
  if (type === "datetime") info.format = attr.getFormat?.() === "date" ? "date" : "datetime";
  if (type === "optionset" || type === "multiselectoptionset") {
    const options = attr.getOptions?.();
    if (options) info.optionKey = JSON.stringify(options.map((o) => [o.value, o.text]).sort((a, b) => Number(a[0]) - Number(b[0])));
  }
  if (type === "lookup") {
    const targets = control?.getEntityTypes?.();
    if (targets) info.targets = targets;
  }
  return info;
}

/** Whether the target column on this form accepts the value. Unknown limits are treated as no limit. */
export function isValueAllowed(attr: AttrLike, value: StoredValue): boolean {
  if (value === null || value === undefined) return true;
  const type = attr.getAttributeType();
  switch (type) {
    case "optionset": {
      const options = attr.getOptions?.();
      return !options || options.some((o) => o.value === value);
    }
    case "multiselectoptionset": {
      const options = attr.getOptions?.();
      return Array.isArray(value) && (!options || (value as number[]).every((v) => options.some((o) => o.value === v)));
    }
    case "lookup": {
      const types = attr.controls?.get()[0]?.getEntityTypes?.();
      const l = value as StoredLookup;
      return !types || types.length === 0 || types.includes(l.entityType);
    }
    case "string":
    case "memo": {
      const max = attr.getMaxLength?.();
      return typeof value === "string" && (max === undefined || max <= 0 || value.length <= max);
    }
    case "integer":
    case "decimal":
    case "double":
    case "money": {
      if (typeof value !== "number" || !Number.isFinite(value)) return false;
      if (type === "integer" && !Number.isInteger(value)) return false;
      const min = attr.getMin?.();
      const max = attr.getMax?.();
      if (typeof min === "number" && value < min) return false;
      if (typeof max === "number" && value > max) return false;
      const precision = attr.getPrecision?.();
      if ((type === "decimal" || type === "money") && typeof precision === "number") {
        const f = 10 ** precision;
        if (Math.abs(value * f - Math.round(value * f)) > 1e-6) return false;
      }
      return true;
    }
    case "boolean":
      return typeof value === "boolean";
    case "datetime":
      return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
    default:
      return true;
  }
}

const TYPE_BY_METADATA: Record<string, string> = {
  StringType: "string",
  MemoType: "memo",
  IntegerType: "integer",
  DecimalType: "decimal",
  DoubleType: "double",
  MoneyType: "money",
  BooleanType: "boolean",
  DateTimeType: "datetime",
  PicklistType: "optionset",
  StatusType: "optionset",
  StateType: "optionset",
  MultiSelectPicklistType: "multiselectoptionset",
  LookupType: "lookup",
  CustomerType: "lookup",
  OwnerType: "lookup",
};

/** Columns of a table as the metadata describes them; used where no form is open (the management dialog). */
export async function loadColumns(api: Api, table: string): Promise<ColumnInfo[]> {
  if (!/^[a-z0-9_]+$/i.test(table)) throw new Error(`Invalid table name: ${table}`);
  const base = `EntityDefinitions(LogicalName='${table}')/Attributes`;
  const res = await api.request("GET", `${base}?$select=LogicalName,AttributeTypeName,DisplayName,IsValidForRead,AttributeOf`);
  const columns = new Map<string, ColumnInfo>();
  for (const a of res.data.value as any[]) {
    const type = TYPE_BY_METADATA[a.AttributeTypeName?.Value as string];
    if (!type || a.AttributeOf || a.IsValidForRead === false) continue;
    columns.set(a.LogicalName, { name: a.LogicalName, label: a.DisplayName?.UserLocalizedLabel?.Label || a.LogicalName, type });
  }

  const extra = async (cast: string, query: string, apply: (c: ColumnInfo, row: any) => void): Promise<void> => {
    try {
      const r = await api.request("GET", `${base}/Microsoft.Dynamics.CRM.${cast}?${query}`);
      for (const row of r.data.value as any[]) {
        const c = columns.get(row.LogicalName);
        if (c) apply(c, row);
      }
    } catch {
      // Without these details the affected columns simply are not offered as copy sources.
    }
  };
  const globalSet = "$select=LogicalName&$expand=GlobalOptionSet($select=Name)";
  await extra("PicklistAttributeMetadata", globalSet, (c, row) => { if (row.GlobalOptionSet?.Name) c.optionKey = row.GlobalOptionSet.Name; });
  await extra("MultiSelectPicklistAttributeMetadata", globalSet, (c, row) => { if (row.GlobalOptionSet?.Name) c.optionKey = row.GlobalOptionSet.Name; });
  await extra("LookupAttributeMetadata", "$select=LogicalName,Targets", (c, row) => { c.targets = row.Targets ?? []; });
  await extra("DateTimeAttributeMetadata", "$select=LogicalName,Format", (c, row) => { c.format = row.Format === "DateOnly" ? "date" : "datetime"; });
  return [...columns.values()];
}
