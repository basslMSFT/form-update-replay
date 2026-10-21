import { StoredLookup, StoredValue } from "./model";

/** A form control, its section and its tab; each can be hidden on its own. */
export interface ControlLike {
  getDisabled?(): boolean;
  getVisible?(): boolean;
  getLabel?(): string;
  getEntityTypes?(): string[];
  getParent?(): { getVisible?(): boolean; getParent?(): { getVisible?(): boolean } | null } | null;
}

/** The subset of the Xrm attribute API that the engine uses; keeps the logic testable without a form. */
export interface AttrLike {
  getName(): string;
  getAttributeType(): string;
  getValue(): unknown;
  setValue(value: unknown): void;
  fireOnChange(): void;
  getFormat?(): string | null;
  getOptions?(): Array<{ value: number; text: string }> | undefined;
  getMaxLength?(): number | undefined;
  getMin?(): number | undefined;
  getMax?(): number | undefined;
  getPrecision?(): number | undefined;
  addOnChange(handler: (ctx: unknown) => void): void;
  removeOnChange(handler: (ctx: unknown) => void): void;
  controls?: { get(): ControlLike[] };
  getUserPrivilege?(): { canRead: boolean; canUpdate: boolean; canCreate: boolean };
}

interface XrmLookup {
  id: string;
  entityType: string;
  name?: string | null;
}

const pad = (n: number): string => String(n).padStart(2, "0");

export function cleanGuid(id: string): string {
  return id.replace(/[{}]/g, "").toLowerCase();
}

function toStoredLookup(l: XrmLookup): StoredLookup {
  const out: StoredLookup = { entityType: l.entityType, id: cleanGuid(l.id) };
  if (l.name) out.name = l.name;
  return out;
}

/** Reads the current value of an attribute as a JSON-safe value. Returns null for empty. */
export function readValue(attr: AttrLike): StoredValue {
  const raw = attr.getValue();
  if (raw === null || raw === undefined) return null;
  switch (attr.getAttributeType()) {
    case "datetime": {
      const d = raw as Date;
      if (attr.getFormat?.() === "date") return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      return d.toISOString();
    }
    case "lookup": {
      const arr = raw as XrmLookup[];
      return arr.length ? toStoredLookup(arr[0]!) : null;
    }
    case "multiselectoptionset":
      return [...(raw as number[])].sort((a, b) => a - b);
    default:
      return raw as StoredValue;
  }
}

/** Converts a stored value to what attribute.setValue expects. */
export function toXrmValue(attr: AttrLike, value: StoredValue | undefined): unknown {
  if (value === null || value === undefined) return null;
  switch (attr.getAttributeType()) {
    case "datetime": {
      const s = value as string;
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
      return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
    }
    case "lookup": {
      const l = value as StoredLookup;
      return [{ id: `{${l.id.toUpperCase()}}`, entityType: l.entityType, name: l.name ?? "" }];
    }
    default:
      return value;
  }
}

export function valuesEqual(a: StoredValue | undefined, b: StoredValue | undefined): boolean {
  const x = a ?? null;
  const y = b ?? null;
  if (x === y) return true;
  if (x === null || y === null) return false;
  if (typeof x !== "object" || typeof y !== "object") return false;
  if (Array.isArray(x) || Array.isArray(y)) {
    if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length) return false;
    return x.every((v, i) => JSON.stringify(v) === JSON.stringify(y[i]));
  }
  return (x as StoredLookup).id === (y as StoredLookup).id && (x as StoredLookup).entityType === (y as StoredLookup).entityType;
}
