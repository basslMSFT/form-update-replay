/** Shared types for recordings and steps. */

import type { CalcSpec } from "./calc";

/** Most records one grid replay may update; it matches the largest page a grid shows. */
export const MAX_RECORDS = 250;

export const SCHEMA_VERSION = 1;

export type Operation = "set" | "clear" | "addRelated";
export type ValueMode = "fixed" | "copy" | "prompt" | "calculate";

/** A note or task that a replay adds to the record. Text may contain {{column}}, {{today}}, {{now}} and {{user}}. */
export type RelatedSpec =
  | { kind: "note"; subject: string; text: string }
  | { kind: "task"; subject: string; description: string; dueInDays: number | null; priority: 0 | 1 | 2 };

/** Longest stored text; the step table keeps the spec as JSON in a 10000-character column. */
export const RELATED_TEXT_MAX = 6000;


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
  /** Only for operation "addRelated"; `column` then holds "annotation" or "task". */
  related?: RelatedSpec;
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
  operation: { set: 352410000, clear: 352410001, addRelated: 352410002 },
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
