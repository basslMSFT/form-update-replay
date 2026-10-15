import { ReactElement } from "react";
import { Button, Field, Input, Select, Text, makeStyles, tokens } from "@fluentui/react-components";
import { ArrowDown20Regular, ArrowUp20Regular, Delete20Regular } from "@fluentui/react-icons";
import { Step, StoredValue } from "../model";
import { ColumnInfo, copyCandidates } from "../compat";
import { describeValue, labelFor } from "../controller";
import { t } from "../i18n";

const useStyles = makeStyles({
  list: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS },
  card: { border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, padding: tokens.spacingHorizontalS, display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXS, minWidth: 0 },
  head: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: tokens.spacingHorizontalXS },
  title: { minWidth: 0, overflowWrap: "anywhere" },
  tools: { display: "flex", flexShrink: 0 },
  muted: { color: tokens.colorNeutralForeground3 },
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

/** Every "copy" step needs a source column before the recording can be saved. */
export function stepsValid(steps: Step[]): boolean {
  return steps.length > 0 && steps.every((x) => x.operation === "clear" || x.valueMode !== "copy" || !!x.sourceColumn);
}

/** Editable list of recorded changes, used both when reviewing a new recording and when editing a saved one. */
export function StepsEditor({ steps, onChange, fc, labels, optionLabels, columns }: Props): ReactElement {
  const s = useStyles();
  const update = (i: number, patch: Partial<Step>): void => onChange(steps.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const remove = (i: number): void => onChange(steps.filter((_, j) => j !== i).map((x, j) => ({ ...x, sortOrder: (j + 1) * 10 })));
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
        const canCopy = sources.length > 0 || step.valueMode === "copy";
        // A value that was never stored (an "ask" step loaded from Dataverse) cannot become a fixed value again.
        const canFixed = step.value !== undefined || step.valueMode === "fixed";
        return (
          <div key={`${step.column}-${i}`} className={s.card} role="listitem">
            <div className={s.head}>
              <div className={s.title}>
                <Text weight="semibold">{labelFor(fc, step.column, labels)}</Text>
                <br />
                <Text size={200} className={s.muted}>{step.column} · {step.operation === "clear" ? t("opClear") : t("opSet")}</Text>
              </div>
              <div className={s.tools}>
                <Button appearance="subtle" size="small" icon={<ArrowUp20Regular />} aria-label={t("moveUp")} title={t("moveUp")} disabled={i === 0} onClick={() => move(i, -1)} />
                <Button appearance="subtle" size="small" icon={<ArrowDown20Regular />} aria-label={t("moveDown")} title={t("moveDown")} disabled={i === steps.length - 1} onClick={() => move(i, 1)} />
                <Button appearance="subtle" size="small" icon={<Delete20Regular />} aria-label={t("removeStep")} title={t("removeStep")} onClick={() => remove(i)} />
              </div>
            </div>

            {step.operation === "clear" ? (
              <Text className={s.muted}>{t("emptyValue")}</Text>
            ) : (
              <>
                {step.valueMode === "fixed" ? <Text className={s.value}>{describeValue(fc, step, step.value as StoredValue, optionLabels)}</Text> : null}
                <Field label={t("stepSource")} size="small">
                  <Select
                    size="small"
                    value={step.valueMode}
                    onChange={(_, d) => {
                      const mode = d.value as Step["valueMode"];
                      update(i, { valueMode: mode, ...(mode === "copy" ? {} : { sourceColumn: undefined }) });
                    }}
                  >
                    {canFixed ? <option value="fixed">{t("modeFixed")}</option> : null}
                    <option value="prompt">{t("modePrompt")}</option>
                    {canCopy ? <option value="copy">{t("modeCopy")}</option> : null}
                  </Select>
                </Field>
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
                      {sources.map((c) => <option key={c.name} value={c.name}>{c.label} ({c.name})</option>)}
                    </Select>
                  </Field>
                ) : null}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
