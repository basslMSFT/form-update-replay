import { ReactElement } from "react";
import { Badge, Button, MessageBar, MessageBarBody, Text, makeStyles, tokens } from "@fluentui/react-components";
import { PlanItem, SKIP_REASON_KEYS } from "../player";
import { StoredValue } from "../model";
import { describeValue, labelFor } from "../controller";
import { t } from "../i18n";
import { PromptField, PromptSpec } from "./PromptField";
import { describeResolved, relatedKindOf } from "../related";

const useStyles = makeStyles({
  muted: { color: tokens.colorNeutralForeground3 },
  list: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS, marginTop: tokens.spacingVerticalS },
  card: {
    display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXS, minWidth: 0, padding: tokens.spacingHorizontalS,
    backgroundColor: tokens.colorNeutralBackground3,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`, borderRight: `1px solid ${tokens.colorNeutralStroke2}`, borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    borderLeft: `3px solid ${tokens.colorBrandBackground}`, borderRadius: tokens.borderRadiusMedium,
  },
  head: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: tokens.spacingHorizontalXS },
  title: { minWidth: 0, overflowWrap: "anywhere" },
  text: { overflowWrap: "anywhere", whiteSpace: "pre-wrap" },
  actions: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalS, marginTop: tokens.spacingVerticalM },
});

type PromptAttr = {
  getOptions?(): Array<{ value: number; text: string }> | undefined;
  getFormat?(): string | null;
  controls: { get(i: number): { getEntityTypes?(): string[] } | undefined };
};

interface InputProps {
  item: PlanItem;
  fc: Xrm.FormContext;
  value: StoredValue | undefined;
  /** undefined means "not answered". */
  onChange: (v: StoredValue | undefined) => void;
}

/** Describes the column of the open form to the shared editor. */
function PromptInput({ item, fc, value, onChange }: InputProps): ReactElement {
  const attr = fc.getAttribute(item.step.column) as unknown as PromptAttr | undefined;
  const spec: PromptSpec = {
    type: item.step.columnType,
    label: item.step.promptText || labelFor(fc, item.step.column),
    options: attr?.getOptions?.() ?? [],
    targets: attr?.controls.get(0)?.getEntityTypes?.() ?? [],
    dateOnly: attr?.getFormat?.() === "date",
  };
  return <PromptField spec={spec} value={value} onChange={onChange} />;
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
                <div className={s.title}><Text weight="semibold">{i.step.operation === "addRelated" ? t(relatedKindOf(i.step) === "note" ? "relatedNote" : "relatedTask") : labelFor(fc, i.step.column)}</Text></div>
                <Badge appearance={needsAnswer || i.status !== "skip" ? "tint" : "filled"} color={needsAnswer ? "informative" : i.status === "apply" ? "brand" : i.status === "noop" ? "success" : "danger"}>
                  {needsAnswer ? t("statusAsk") : i.status === "apply" ? t("statusApply") : i.status === "noop" ? t("statusNoop") : t("statusSkip")}
                </Badge>
              </div>
              {showInput ? (
                <PromptInput item={i} fc={fc} value={answers[i.step.column]} onChange={(v) => onAnswer(i.step.column, v)} />
              ) : null}
              {i.status === "skip" && i.reason === "recordUnsaved" ? (
                <MessageBar intent="error"><MessageBarBody>{t(SKIP_REASON_KEYS.recordUnsaved)}</MessageBarBody></MessageBar>
              ) : i.status === "skip" && !needsAnswer ? (
                <Text size={200} className={s.muted}>{t(SKIP_REASON_KEYS[i.reason!])}</Text>
              ) : i.related ? (
                <Text size={200} className={s.text}>{describeResolved(i.related)}{i.related.kind === "task" && i.related.dueDate ? ` (${t("relatedDueOn", new Date(`${i.related.dueDate}T00:00:00`).toLocaleDateString())})` : ""}</Text>
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
