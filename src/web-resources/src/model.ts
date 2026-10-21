/** Shared types for recordings and steps. */

import type { CalcSpec } from "./calc";

/** Most records one grid replay may update; it matches the largest page a grid shows. */
export const MAX_RECORDS = 250;

export const SCHEMA_VERSION = 1;

export type Operation = "set" | "clear";
export type ValueMode = "fixed" | "copy" | "prompt" | "calculate";

export interface StoredLookup {
  entityType: string;
  /** Lower-case GUID without braces. */
  id: string;
  name?: string;
}

/** JSON-serialisable value kept in the step table. Dates are ISO strings (date-only columns use YYYY-MM-DD). */
export type StoredValue = string | number | boolean | StoredLookup | StoredLookup[] | number[] | null;

export interface Step {
  sortOrder: number;
  operation: Operation;
  valueMode: ValueMode;
  column: string;
  columnType: string;
  value?: StoredValue;
  sourceColumn?: string;
  promptText?: string;
  /** Only for valueMode "calculate". */
  calc?: CalcSpec;
}

export interface Recording {
  id?: string;
  name: string;
  description?: string;
  table: string;
  steps: Step[];
}

/** Option set values used by the Dataverse tables (publisher option value prefix 10000). */
export const OPTION = {
  operation: { set: 352410000, clear: 352410001 },
  valueMode: { fixed: 352410000, copy: 352410001, prompt: 352410002, calculate: 352410003 },
} as const;

export const SUPPORTED_TYPES = [
  "string",
  "memo",
  "integer",
  "decimal",
  "double",
  "money",
  "boolean",
  "datetime",
  "optionset",
  "multiselectoptionset",
  "lookup",
] as const;

export type SupportedType = (typeof SUPPORTED_TYPES)[number];

export function isSupportedType(t: string): t is SupportedType {
  return (SUPPORTED_TYPES as readonly string[]).includes(t);
}
