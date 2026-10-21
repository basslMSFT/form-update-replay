import { ReactElement, useCallback, useEffect, useMemo, useState } from "react";
import { Button, Input, MessageBar, MessageBarBody, Select, Spinner, Text, Title3, makeStyles, tokens } from "@fluentui/react-components";
import { Play20Filled, Record20Filled, Stop20Filled, Open20Regular } from "@fluentui/react-icons";
import { FormEntry, currentForm, recordOnScreen, toFormLike } from "../registry";
import { discardRecording, isRecording, labelFor, leftOutColumns, picker, recordedCount, startRecording, stopRecording } from "../controller";
import { loadNonSettable } from "../derived";
import { RecordingRow, createRecording, getRecording, listRecordings } from "../store";
import { PlanItem, apply, plan } from "../player";
import { Step, StoredValue, isSupportedType } from "../model";
import { columnInfoFromAttr } from "../compat";
import { StepsEditor, stepsValid } from "./StepsEditor";
import { PreviewPanel } from "./PreviewPanel";
import { Field } from "./fields";
import { Msg, Notice } from "./Notice";
import { errorText, useApp } from "./context";
import { getLang, t } from "../i18n";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS, padding: tokens.spacingHorizontalS, minWidth: 0, boxSizing: "border-box" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: tokens.spacingHorizontalXS },
  card: { border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, padding: tokens.spacingHorizontalS, display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS, minWidth: 0 },
  row: { display: "flex", gap: tokens.spacingHorizontalS, alignItems: "center", flexWrap: "wrap" },
  muted: { color: tokens.colorNeutralForeground3 },
});

const HUB = "bassllab_/furep/html/furep.hub.html";

export function Pane(): ReactElement {
  const s = useStyles();
  const { api, identity, xrm } = useApp();
  const [entry, setEntry] = useState<FormEntry | null>(() => currentForm());
  const [needsCommand, setNeedsCommand] = useState(false);
  const [recording, setRecording] = useState(false);
  const [count, setCount] = useState(0);
  const [draft, setDraft] = useState<Step[] | null>(null);
  const [draftName, setDraftName] = useState("");
  const [rows, setRows] = useState<RecordingRow[]>([]);
  const [selected, setSelected] = useState("");
  const [preview, setPreview] = useState<{ items: PlanItem[]; steps: Step[] } | null>(null);
  const [answers, setAnswers] = useState<Record<string, StoredValue>>({});
  const [message, setMessage] = useState<Msg | null>(null);
  const [busy, setBusy] = useState(false);

  // Follow the user to other records and sessions, and keep the live change counter fresh.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const cur = currentForm();
      if (!cur && picker.active) return;
      setEntry((prev) => (prev?.key === cur?.key ? prev : cur));
      setNeedsCommand(!cur && recordOnScreen() !== null);
      if (cur) {
        setRecording(isRecording(cur));
        setCount(recordedCount(cur));
      }
    }, 800);
    return () => window.clearInterval(timer);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setRows(await listRecordings(api, identity, "all"));
    } catch (e) {
      setMessage({ intent: "error", text: t("loadError", errorText(e)) });
    }
  }, [api, identity]);

  useEffect(() => { void refresh(); }, [refresh, entry?.key]);

  // Warm the lookup of non-writable columns so that pressing Record does not wait for it.
  useEffect(() => { if (entry?.entity) void loadNonSettable(api, entry.entity); }, [api, entry?.entity]);

  // Switching records or sessions drops any half-finished review or preview.
  useEffect(() => {
    setDraft(null);
    setPreview(null);
    setSelected("");
    if (entry) {
      setRecording(isRecording(entry));
      setCount(recordedCount(entry));
    }
  }, [entry?.key]);

  const tableRows = useMemo(() => rows.filter((r) => entry && r.table === entry.entity), [rows, entry]);

  // Columns of the open form; the review step offers only the type-compatible ones as copy sources.
  const columns = useMemo(
    () => (entry && draft ? toFormLike(entry.fc).attributes.filter((a) => isSupportedType(a.getAttributeType())).map(columnInfoFromAttr) : []),
    [entry, draft],
  );

  const onStart = async (): Promise<void> => {
    if (!entry) return;
    setMessage(null);
    setBusy(true);
    try {
      // Columns the platform fills in itself (address composite, full name, ...) cannot be replayed, so they are not recorded.
      const skip = await loadNonSettable(api, entry.entity);
      startRecording(entry, skip);
      setRecording(true);
      setCount(0);
    } finally {
      setBusy(false);
    }
  };

  const onStop = async (): Promise<void> => {
    if (!entry) return;
    setBusy(true);
    try {
      const steps = await stopRecording(entry);
      const left = leftOutColumns(entry).map((c) => labelFor(entry.fc, c)).join(", ");
      setRecording(false);
      if (steps.length === 0) {
        setMessage(left ? { intent: "warning", text: t("paneOnlyLeftOut", left) } : { intent: "info", text: t("paneNoChanges") });
      } else {
        // A warning bar stays until it is closed, so the note is still there while the changes are reviewed.
        if (left) setMessage({ intent: "warning", text: t("paneLeftOut", left) });
        setDraft(steps);
        setDraftName("");
      }
    } finally {
      setBusy(false);
    }
  };

  const onSave = async (): Promise<void> => {
    if (!entry || !draft) return;
    setBusy(true);
    try {
      await createRecording(api, { name: draftName.trim(), table: entry.entity, steps: draft.map((x, i) => ({ ...x, sortOrder: (i + 1) * 10 })) });
      setDraft(null);
      setMessage({ intent: "success", text: t("recordingSaved") });
      await refresh();
    } catch (e) {
      setMessage({ intent: "error", text: t("errorGeneric", errorText(e)) });
    } finally {
      setBusy(false);
    }
  };

  const buildPlan = (steps: Step[], given: Record<string, StoredValue>): PlanItem[] =>
    plan(toFormLike(entry!.fc), steps, { answers: given, now: new Date(), userName: xrm.Utility.getGlobalContext().userSettings.userName, locale: getLang() });

  const onPreview = async (): Promise<void> => {
    if (!entry || !selected) return;
    setBusy(true);
    setMessage(null);
    try {
      const { steps } = await getRecording(api, selected);
      setAnswers({});
      setPreview({ steps, items: buildPlan(steps, {}) });
    } catch (e) {
      setMessage({ intent: "error", text: t("errorGeneric", errorText(e)) });
    } finally {
      setBusy(false);
    }
  };

  const onAnswer = (column: string, value: StoredValue | undefined): void => {
    const next = { ...answers };
    if (value === undefined) delete next[column]; else next[column] = value;
    setAnswers(next);
    if (preview) setPreview({ ...preview, items: buildPlan(preview.steps, next) });
  };

  const onApply = (): void => {
    if (!entry || !preview) return;
    const res = apply(toFormLike(entry.fc), preview.items);
    setPreview(null);
    setMessage(
      res.failed.length
        ? { intent: "error", text: t("errorGeneric", res.failed.map((f) => `${f.column}: ${f.message}`).join("; ")) }
        : { intent: "success", text: t("applied", res.applied.length) },
    );
  };

  const openHub = (): void => {
    void xrm.Navigation.navigateTo(
      { pageType: "webresource", webresourceName: HUB, data: "mode=dialog" },
      { target: 2, position: 1, width: { value: 80, unit: "%" }, height: { value: 80, unit: "%" }, title: t("recordingsTitle") },
    );
  };

  return (
    <div className={s.root}>
      <div className={s.header}>
        <Title3>{t("appTitle")}</Title3>
        <Button appearance="subtle" icon={<Open20Regular />} onClick={openHub}>{t("manage")}</Button>
      </div>

      <Notice message={message} onDismiss={() => setMessage(null)} />

      {!entry ? (
        <Text className={s.muted}>{t(needsCommand ? "paneSelectReplay" : "paneNoForm")}</Text>
      ) : (
        <>
          <div className={s.card}>
            <Text weight="semibold">{t("paneCurrentForm")}</Text>
            <Text size={200} className={s.muted}>{entry.entity}{entry.id ? "" : " (new)"}</Text>

            {draft ? (
              <>
                <Text weight="semibold">{t("paneReview")}</Text>
                <MessageBar intent="warning"><MessageBarBody>{t("piiWarning")}</MessageBarBody></MessageBar>
                <Field label={t("paneName")} required>
                  <Input value={draftName} onChange={(_, d) => setDraftName(d.value)} />
                </Field>
                <StepsEditor steps={draft} onChange={setDraft} fc={entry.fc} columns={columns} />
                <div className={s.row}>
                  <Button appearance="primary" disabled={busy || !draftName.trim() || !stepsValid(draft)} onClick={() => void onSave()}>{t("paneSave")}</Button>
                  <Button onClick={() => { discardRecording(entry); setDraft(null); }}>{t("paneDiscard")}</Button>
                </div>
              </>
            ) : recording ? (
              <>
                <Text>{t("paneRecording", count)}</Text>
                <div className={s.row}>
                  <Button appearance="primary" icon={<Stop20Filled />} disabled={busy} onClick={() => void onStop()}>{t("paneStop")}</Button>
                </div>
              </>
            ) : (
              <div className={s.row}>
                <Button appearance="primary" icon={busy ? <Spinner size="tiny" /> : <Record20Filled />} disabled={busy} onClick={() => void onStart()}>{t("paneRecord")}</Button>
              </div>
            )}
          </div>

          {!draft && !recording ? (
            <div className={s.card}>
              <Text weight="semibold">{t("paneReplay")}</Text>
              {preview ? (
                <PreviewPanel items={preview.items} fc={entry.fc} answers={answers} onAnswer={onAnswer} onApply={onApply} onCancel={() => setPreview(null)} />
              ) : tableRows.length === 0 ? (
                <Text className={s.muted}>{t("paneNoRecordings")}</Text>
              ) : (
                <>
                  <Select value={selected} onChange={(_, d) => setSelected(d.value)} aria-label={t("paneChoose")}>
                    <option value="">{t("paneChoose")}</option>
                    {tableRows.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.stepCount})</option>)}
                  </Select>
                  <div className={s.row}>
                    <Button appearance="primary" icon={busy ? <Spinner size="tiny" /> : <Play20Filled />} disabled={!selected || busy} onClick={() => void onPreview()}>{t("panePreview")}</Button>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
