import { ReactElement } from "react";
import { Badge, Button, Input, Select, Text, Textarea, makeStyles, tokens } from "@fluentui/react-components";
import { Add20Regular, ArrowDown20Regular, ArrowUp20Regular, Delete20Regular } from "@fluentui/react-icons";
import { RELATED_TEXT_MAX, RelatedSpec, Step, StoredValue } from "../model";
import { RelatedKind, newRelated, relatedKindOf, relatedValid } from "../related";
import { ColumnInfo, copyCandidates } from "../compat";
import { calcValid, defaultCalc, isCalculable } from "../calc";
import { CalcEditor } from "./CalcEditor";
import { Field } from "./fields";
import { describeValue, labelFor } from "../controller";
import { t } from "../i18n";

const useStyles = makeStyles({
  list: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM },
  card: {
    display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden",
    backgroundColor: tokens.colorNeutralBackground1,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`, borderRight: `1px solid ${tokens.colorNeutralStroke2}`, borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    borderLeft: `4px solid ${tokens.colorBrandBackground}`,
    borderRadius: tokens.borderRadiusMedium,
    boxShadow: tokens.shadow4,
  },
  head: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: tokens.spacingHorizontalXS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS}`,
    backgroundImage: `linear-gradient(90deg, ${tokens.colorBrandBackground2} 0%, ${tokens.colorNeutralBackground1} 100%)`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  titleRow: { display: "flex", alignItems: "flex-start", gap: tokens.spacingHorizontalS, minWidth: 0 },
  title: { minWidth: 0, overflowWrap: "anywhere" },
  tools: { display: "flex", flexShrink: 0 },
  body: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXS, padding: tokens.spacingHorizontalS, minWidth: 0 },
  settings: {
    display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS, minWidth: 0,
    backgroundColor: tokens.colorNeutralBackground3, border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingHorizontalS,
  },
  muted: { color: tokens.colorNeutralForeground3 },
  addRow: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalS },
  value: { overflowWrap: "anywhere" },
});

interface Props {
  steps: Step[];
  onChange: (steps: Step[]) => void;
  fc?: Xrm.FormContext;
  labels?: Record<string, string>;
  optionLabels?: Record<string, Record<string, string>>;
  /** Columns of the table; enables "Copy from column" with only the compatible ones offered. */
  columns?: ColumnInfo[];
}

/** Every "copy" step needs a source column and every "calculate" step a complete calculation before the recording can be saved. */
export function stepsValid(steps: Step[]): boolean {
  return steps.length > 0 && steps.every((x) => (x.operation === "addRelated" ? relatedValid(x.related) : x.operation === "clear" || (x.valueMode === "copy" ? !!x.sourceColumn : x.valueMode === "calculate" ? calcValid(x.calc) : true)));
}

/** Editable list of recorded changes, used both when reviewing a new recording and when editing a saved one. */
export function StepsEditor({ steps, onChange, fc, labels, optionLabels, columns }: Props): ReactElement {
  const s = useStyles();
  const update = (i: number, patch: Partial<Step>): void => onChange(steps.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const remove = (i: number): void => onChange(steps.filter((_, j) => j !== i).map((x, j) => ({ ...x, sortOrder: (j + 1) * 10 })));
  const addRelated = (kind: RelatedKind): void =>
    onChange([...steps, { sortOrder: (steps.length + 1) * 10, operation: "addRelated", valueMode: "fixed", column: kind === "note" ? "annotation" : "task", columnType: "related", related: newRelated(kind) }]);
  const move = (i: number, by: -1 | 1): void => {
    const target = i + by;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[i], next[target]] = [next[target]!, next[i]!];
    onChange(next.map((x, j) => ({ ...x, sortOrder: (j + 1) * 10 })));
  };

  return (
    <div className={s.list} role="list" aria-label={t("stepsTitle")}>
      {steps.map((step, i) => {
        const sources = columns ? copyCandidates(columns.find((c) => c.name === step.column), columns) : [];
        // Always offered so it is discoverable; the list says when no column of a matching type exists.
        const canCopy = columns !== undefined || step.valueMode === "copy";
        // A value that was never stored (an "ask" step loaded from Dataverse) cannot become a fixed value again.
        const canFixed = step.value !== undefined || step.valueMode === "fixed";
        return (
          <div key={`${step.column}-${i}`} className={s.card} role="listitem">
            <div className={s.head}>
              <div className={s.titleRow}>
                <Badge appearance="filled" color="brand" shape="circular" size="large" aria-hidden>{i + 1}</Badge>
                <div className={s.title}>
                  <Text weight="semibold">{step.operation === "addRelated" ? t(relatedKindOf(step) === "note" ? "relatedNote" : "relatedTask") : labelFor(fc, step.column, labels)}</Text>
                  <br />
                  <Text size={200} className={s.muted}>{step.operation === "addRelated" ? t("relatedAdded") : `${step.column} · ${step.operation === "clear" ? t("opClear") : t("opSet")}`}</Text>
                </div>
              </div>
              <div className={s.tools}>
                <Button appearance="subtle" size="small" icon={<ArrowUp20Regular />} aria-label={t("moveUp")} title={t("moveUp")} disabled={i === 0} onClick={() => move(i, -1)} />
                <Button appearance="subtle" size="small" icon={<ArrowDown20Regular />} aria-label={t("moveDown")} title={t("moveDown")} disabled={i === steps.length - 1} onClick={() => move(i, 1)} />
                <Button appearance="subtle" size="small" icon={<Delete20Regular />} aria-label={t("removeStep")} title={t("removeStep")} onClick={() => remove(i)} />
              </div>
            </div>

            <div className={s.body}>
            {step.operation === "addRelated" ? (
              step.related ? (
                <RelatedEditor spec={step.related} onChange={(related) => update(i, { related })} />
              ) : (
                <Text className={s.muted}>{t("relatedDamaged")}</Text>
              )
            ) : step.operation === "clear" ? (
              <Text className={s.muted}>{t("emptyValue")}</Text>
            ) : (
              <div className={s.settings}>
                {step.valueMode === "fixed" ? <Text className={s.value}>{describeValue(fc, step, step.value as StoredValue, optionLabels)}</Text> : null}
                <Field label={t("stepSource")} size="small">
                  <Select
                    size="small"
                    value={step.valueMode}
                    onChange={(_, d) => {
                      const mode = d.value as Step["valueMode"];
                      update(i, { valueMode: mode, ...(mode === "copy" ? {} : { sourceColumn: undefined }), ...(mode === "calculate" ? { calc: step.calc ?? defaultCalc(step.columnType) ?? undefined } : {}) });
                    }}
                  >
                    {canFixed ? <option value="fixed">{t("modeFixed")}</option> : null}
                    <option value="prompt">{t("modePrompt")}</option>
                    {canCopy ? <option value="copy">{t("modeCopy")}</option> : null}
                    {columns !== undefined && isCalculable(step.columnType) ? <option value="calculate">{t("modeCalculate")}</option> : null}
                  </Select>
                </Field>
                {step.valueMode === "calculate" && step.calc ? (
                  <CalcEditor column={step.column} columnType={step.columnType} spec={step.calc} columns={columns ?? []} onChange={(calc) => update(i, { calc })} />
                ) : null}
                {step.valueMode === "prompt" ? (
                  <>
                    <Field label={t("promptText")} size="small">
                      <Input size="small" value={step.promptText ?? ""} onChange={(_, d) => update(i, { promptText: d.value })} />
                    </Field>
                    <Text size={200} className={s.muted}>{t("promptNotStored")}</Text>
                  </>
                ) : null}
                {step.valueMode === "copy" ? (
                  <Field label={t("sourceColumn")} size="small" required validationMessage={step.sourceColumn ? undefined : t("chooseSource")} validationState={step.sourceColumn ? "none" : "warning"} hint={t("copyHint")}>
                    <Select size="small" value={step.sourceColumn ?? ""} onChange={(_, d) => update(i, { sourceColumn: d.value || undefined })}>
                      <option value="">{sources.length ? t("chooseSource") : t("noCompatibleSource")}</option>
                      {step.sourceColumn && !sources.some((c) => c.name === step.sourceColumn) ? <option value={step.sourceColumn}>{step.sourceColumn} ({t("sourceUnavailable")})</option> : null}
                      {sources.map((c) => <option key={c.name} value={c.name}>{c.label} ({c.name})</option>)}
                    </Select>
                  </Field>
                ) : null}
              </div>
            )}
            </div>
          </div>
        );
      })}
      <div className={s.addRow}>
        <Button size="small" icon={<Add20Regular />} onClick={() => addRelated("note")}>{t("relatedAddNote")}</Button>
        <Button size="small" icon={<Add20Regular />} onClick={() => addRelated("task")}>{t("relatedAddTask")}</Button>
      </div>
    </div>
  );
}

interface RelatedEditorProps {
  spec: RelatedSpec;
  onChange: (spec: RelatedSpec) => void;
}

function RelatedEditor({ spec, onChange }: RelatedEditorProps): ReactElement {
  const s = useStyles();
  const subjectMax = spec.kind === "note" ? 500 : 200;
  return (
    <div className={s.settings}>
      <Field label={t("relatedSubject")} size="small" required={spec.kind === "task"}>
        <Input size="small" maxLength={subjectMax} value={spec.subject} onChange={(_, d) => onChange({ ...spec, subject: d.value })} />
      </Field>
      <Field label={t(spec.kind === "note" ? "relatedText" : "relatedDescription")} size="small">
        <Textarea
          size="small"
          rows={4}
          maxLength={RELATED_TEXT_MAX}
          value={spec.kind === "note" ? spec.text : spec.description}
          onChange={(_, d) => onChange(spec.kind === "note" ? { ...spec, text: d.value } : { ...spec, description: d.value })}
        />
      </Field>
      {spec.kind === "task" ? (
        <>
          <Field label={t("relatedDue")} size="small" hint={t("relatedDueHint")}>
            <Input
              size="small"
              type="number"
              value={spec.dueInDays === null ? "" : String(spec.dueInDays)}
              onChange={(_, d) => onChange({ ...spec, dueInDays: d.value.trim() === "" || !Number.isFinite(Number(d.value)) ? null : Math.trunc(Number(d.value)) })}
            />
          </Field>
          <Field label={t("relatedPriority")} size="small">
            <Select size="small" value={String(spec.priority)} onChange={(_, d) => onChange({ ...spec, priority: Number(d.value) as 0 | 1 | 2 })}>
              <option value="0">{t("priorityLow")}</option>
              <option value="1">{t("priorityNormal")}</option>
              <option value="2">{t("priorityHigh")}</option>
            </Select>
          </Field>
        </>
      ) : null}
      <Text size={200} className={s.muted}>{t("relatedPlaceholders")}</Text>
    </div>
  );
}
