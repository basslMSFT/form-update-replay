import { ReactElement } from "react";
import { Badge, Button, Checkbox, Field, Input, Select, Text, Textarea, makeStyles, tokens } from "@fluentui/react-components";
import { PlanItem, SkipReason } from "../player";
import { StoredLookup, StoredValue } from "../model";
import { describeValue, labelFor, picker } from "../controller";
import { StringKey, t } from "../i18n";
import { useApp } from "./context";

const useStyles = makeStyles({
  muted: { color: tokens.colorNeutralForeground3 },
  list: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS, marginTop: tokens.spacingVerticalS },
  card: { border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, padding: tokens.spacingHorizontalS, display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXS, minWidth: 0 },
  head: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: tokens.spacingHorizontalXS },
  title: { minWidth: 0, overflowWrap: "anywhere" },
  text: { overflowWrap: "anywhere" },
  actions: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalS, marginTop: tokens.spacingVerticalM },
  inline: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalS, alignItems: "center" },
  checks: { display: "flex", flexDirection: "column" },
});

const REASON: Record<SkipReason, StringKey> = {
  missing: "skipMissing",
  readonly: "skipReadonly",
  unsupported: "skipUnsupported",
  typeMismatch: "skipTypeMismatch",
  needsInput: "skipNeedsInput",
  sourceMissing: "skipSourceMissing",
  sourceIncompatible: "skipSourceIncompatible",
  valueNotAllowed: "skipValueNotAllowed",
  calcInputMissing: "skipCalcInputMissing",
  calcInvalid: "skipCalcInvalid",
};

type PromptAttr = {
  getOptions?(): Array<{ value: number; text: string }>;
  getFormat?(): string | null;
  controls: { get(i: number): { getEntityTypes?(): string[] } | undefined };
};

const pad = (n: number): string => String(n).padStart(2, "0");

/** ISO instant to the value format of a datetime-local input, in the user's time zone. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface InputProps {
  item: PlanItem;
  fc: Xrm.FormContext;
  value: StoredValue | undefined;
  /** undefined means "not answered". */
  onChange: (v: StoredValue | undefined) => void;
}

/** Renders the right editor for the column type of the target form, so the answer is always a valid value for it. */
function PromptInput({ item, fc, value, onChange }: InputProps): ReactElement {
  const { xrm } = useApp();
  const s = useStyles();
  const attr = fc.getAttribute(item.step.column) as unknown as PromptAttr | undefined;
  const label = item.step.promptText || labelFor(fc, item.step.column);
  const options = attr?.getOptions?.() ?? [];
  const answered = value !== undefined;

  switch (item.step.columnType) {
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
      const types = attr?.controls.get(0)?.getEntityTypes?.() ?? [];
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
      const dateOnly = attr?.getFormat?.() === "date";
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

interface Props {
  items: PlanItem[];
  fc: Xrm.FormContext;
  answers: Record<string, StoredValue>;
  onAnswer: (column: string, value: StoredValue | undefined) => void;
  onApply: () => void;
  onCancel: () => void;
}

export function PreviewPanel({ items, fc, answers, onAnswer, onApply, onCancel }: Props): ReactElement {
  const s = useStyles();
  const applicable = items.filter((i) => i.status === "apply").length;
  const unanswered = items.some((i) => i.step.valueMode === "prompt" && i.reason === "needsInput");

  return (
    <div>
      <Text weight="semibold" block>{t("previewTitle")}</Text>
      <Text size={200} className={s.muted} block>{t("previewNote")}</Text>

      <div className={s.list}>
        {items.map((i) => {
          const needsAnswer = i.reason === "needsInput" && i.step.valueMode === "prompt";
          // A question the target form cannot take (missing, read-only, other type) is not offered at all.
          const showInput = i.step.valueMode === "prompt" && i.step.operation === "set" && (i.status !== "skip" || needsAnswer || i.reason === "valueNotAllowed");
          return (
            <div key={i.step.column + i.step.sortOrder} className={s.card}>
              <div className={s.head}>
                <div className={s.title}><Text weight="semibold">{labelFor(fc, i.step.column)}</Text></div>
                <Badge appearance="tint" color={needsAnswer ? "informative" : i.status === "apply" ? "brand" : i.status === "noop" ? "success" : "warning"}>
                  {needsAnswer ? t("statusAsk") : i.status === "apply" ? t("statusApply") : i.status === "noop" ? t("statusNoop") : t("statusSkip")}
                </Badge>
              </div>
              {showInput ? (
                <PromptInput item={i} fc={fc} value={answers[i.step.column]} onChange={(v) => onAnswer(i.step.column, v)} />
              ) : null}
              {i.status === "skip" && !needsAnswer ? (
                <Text size={200} className={s.muted}>{t(REASON[i.reason!])}</Text>
              ) : i.status !== "skip" ? (
                <Text size={200} className={s.text}>{describeValue(fc, i.step, i.current)} → <b>{describeValue(fc, i.step, i.next)}</b></Text>
              ) : null}
            </div>
          );
        })}
      </div>

      {unanswered ? <Text size={200} className={s.muted} block style={{ marginTop: tokens.spacingVerticalS }}>{t("previewUnanswered")}</Text> : null}
      <div className={s.actions}>
        <Button appearance="primary" disabled={applicable === 0} onClick={onApply}>{t("previewApply")}</Button>
        <Button onClick={onCancel}>{t("cancel")}</Button>
      </div>
    </div>
  );
}
