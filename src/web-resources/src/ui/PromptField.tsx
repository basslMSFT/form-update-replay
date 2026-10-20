import { ReactElement } from "react";
import { Button, Checkbox, Input, Select, Text, Textarea, makeStyles, tokens } from "@fluentui/react-components";
import { StoredLookup, StoredValue } from "../model";
import { picker } from "../controller";
import { t } from "../i18n";
import { useApp } from "./context";
import { Field } from "./fields";

const useStyles = makeStyles({
  text: { overflowWrap: "anywhere", whiteSpace: "pre-wrap" },
  inline: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalS, alignItems: "center" },
  checks: { display: "flex", flexDirection: "column" },
});

const pad = (n: number): string => String(n).padStart(2, "0");

/** ISO instant to the value format of a datetime-local input, in the user's time zone. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** What the editor needs to know about a column; it comes from a form attribute or from table metadata. */
export interface PromptSpec {
  type: string;
  label: string;
  options: Array<{ value: number; text: string }>;
  targets: string[];
  dateOnly: boolean;
}

interface Props {
  spec: PromptSpec;
  value: StoredValue | undefined;
  /** undefined means "not answered". */
  onChange: (v: StoredValue | undefined) => void;
}

/** Renders the right editor for the column type, so the answer is always a valid value for it. */
export function PromptField({ spec, value, onChange }: Props): ReactElement {
  const { xrm } = useApp();
  const s = useStyles();
  const { label, options } = spec;
  const answered = value !== undefined;

  switch (spec.type) {
    case "boolean":
      return (
        <Field label={label} size="small">
          <Select size="small" value={!answered ? "" : value === null ? "null" : value ? "1" : "0"} onChange={(_, d) => onChange(d.value === "" ? undefined : d.value === "null" ? null : d.value === "1")}>
            <option value="">{t("choose")}</option>
            <option value="1">{t("yes")}</option>
            <option value="0">{t("no")}</option>
            <option value="null">{t("emptyValue")}</option>
          </Select>
        </Field>
      );
    case "optionset":
      return (
        <Field label={label} size="small">
          <Select size="small" value={!answered ? "" : value === null ? "null" : String(value)} onChange={(_, d) => onChange(d.value === "" ? undefined : d.value === "null" ? null : Number(d.value))}>
            <option value="">{t("choose")}</option>
            <option value="null">{t("emptyValue")}</option>
            {options.map((o) => <option key={o.value} value={o.value}>{o.text}</option>)}
          </Select>
        </Field>
      );
    case "multiselectoptionset": {
      const current = Array.isArray(value) ? (value as number[]) : [];
      return (
        <Field label={label} size="small">
          <div className={s.checks}>
            {options.map((o) => (
              <Checkbox
                key={o.value}
                label={o.text}
                checked={current.includes(o.value)}
                onChange={(_, d) => {
                  const next = d.checked === true ? [...current, o.value] : current.filter((v) => v !== o.value);
                  onChange(next.length ? next.sort((a, b) => a - b) : null);
                }}
              />
            ))}
          </div>
        </Field>
      );
    }
    case "lookup": {
      const types = spec.targets;
      const picked = value && typeof value === "object" && !Array.isArray(value) ? (value as StoredLookup) : null;
      const pick = async (): Promise<void> => {
        picker.active = true;
        try {
          const res = await xrm.Utility.lookupObjects({ allowMultiSelect: false, defaultEntityType: types[0] ?? "", entityTypes: types });
          const r = res?.[0];
          if (r) onChange({ entityType: r.entityType, id: r.id.replace(/[{}]/g, "").toLowerCase(), ...(r.name ? { name: r.name } : {}) });
        } finally {
          picker.active = false;
        }
      };
      return (
        <Field label={label} size="small">
          <div className={s.inline}>
            <Text className={s.text}>{answered ? (picked ? picked.name ?? picked.id : t("emptyValue")) : ""}</Text>
            <Button size="small" disabled={types.length === 0} onClick={() => void pick()}>{t("chooseRecord")}</Button>
            {picked ? <Button size="small" appearance="subtle" onClick={() => onChange(null)}>{t("clearAnswer")}</Button> : null}
          </div>
        </Field>
      );
    }
    case "integer":
    case "decimal":
    case "double":
    case "money":
      return (
        <Field label={label} size="small">
          <Input size="small" type="number" value={typeof value === "number" ? String(value) : ""} onChange={(_, d) => onChange(d.value === "" ? undefined : Number(d.value))} />
        </Field>
      );
    case "datetime": {
      const dateOnly = spec.dateOnly;
      const shown = typeof value === "string" ? (dateOnly ? value.slice(0, 10) : toLocalInput(value)) : "";
      return (
        <Field label={label} size="small">
          <Input size="small" type={dateOnly ? "date" : "datetime-local"} value={shown} onChange={(_, d) => onChange(d.value === "" ? undefined : dateOnly ? d.value : new Date(d.value).toISOString())} />
        </Field>
      );
    }
    case "memo":
      return (
        <Field label={label} size="small">
          <Textarea size="small" value={typeof value === "string" ? value : ""} onChange={(_, d) => onChange(d.value === "" ? undefined : d.value)} />
        </Field>
      );
    default:
      return (
        <Field label={label} size="small">
          <Input size="small" value={typeof value === "string" ? value : ""} onChange={(_, d) => onChange(d.value === "" ? undefined : d.value)} />
        </Field>
      );
  }
}
