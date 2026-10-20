import { ReactElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, MessageBar, MessageBarBody, ProgressBar, Select, Spinner, Text, Title3, makeStyles, tokens } from "@fluentui/react-components";
import { ArrowDownload20Regular, ArrowUndo20Regular, Play20Filled, Stop20Filled } from "@fluentui/react-icons";
import { getRegistry } from "../registry";
import { RecordingRow, getRecording, listRecordings } from "../store";
import { Step, StoredValue } from "../model";
import { PlanItem, SKIP_REASON_KEYS } from "../player";
import { TableMeta, loadTableMeta, neededColumns } from "../bulk-meta";
import {
  BulkRecord, LastRun, Outcome, RunControl, csvRows, forgetRun, lastRunFor, loadRecords, planRecord, rememberRun, runBulk, summarize, toCsv, undoRun,
} from "../bulk";
import { getLang, t } from "../i18n";
import { PromptField, PromptSpec } from "./PromptField";
import { Msg, Notice } from "./Notice";
import { errorText, useApp } from "./context";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM, padding: tokens.spacingHorizontalL, boxSizing: "border-box", minWidth: 0 },
  card: { border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, padding: tokens.spacingHorizontalM, display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS, minWidth: 0 },
  row: { display: "flex", gap: tokens.spacingHorizontalS, alignItems: "center", flexWrap: "wrap" },
  muted: { color: tokens.colorNeutralForeground3 },
  table: { borderCollapse: "collapse", width: "100%", fontSize: tokens.fontSizeBase200 },
  th: { textAlign: "left", padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`, borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, color: tokens.colorNeutralForeground3, fontWeight: tokens.fontWeightSemibold },
  td: { padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`, borderBottom: `1px solid ${tokens.colorNeutralStroke3}`, verticalAlign: "top", overflowWrap: "anywhere" },
  scroll: { maxHeight: "260px", overflowY: "auto" },
});

type Phase = "choose" | "reading" | "preview" | "confirm" | "running" | "done" | "undoing" | "undone";

const PREVIEW_ROWS = 15;

function specFor(step: Step, meta: TableMeta): PromptSpec | null {
  const col = meta.columns.get(step.column);
  if (!col) return null;
  return { type: col.type, label: step.promptText || col.label, options: col.options ?? [], targets: col.targets ?? [], dateOnly: col.format === "date" };
}

function resultText(o: Outcome, undo: boolean, item?: PlanItem): string {
  if (item && item.status === "skip") return t(SKIP_REASON_KEYS[item.reason ?? "missing"]);
  if (item && item.status === "noop") return t("statusNoop");
  switch (o.status) {
    case "applied": return t(undo ? "resultRestored" : "resultUpdated");
    case "unchanged": return t("resultUnchanged");
    case "conflict": return t(undo ? "resultKept" : "resultConflict");
    case "notStarted": return t("resultNotStarted");
    default: return o.message ?? "";
  }
}

function download(table: string, meta: TableMeta, outcomes: Outcome[], undo: boolean): void {
  const header = [t("csvRecord"), t("csvId"), t("csvColumn"), t("csvBefore"), t("csvAfter"), t("csvResult")];
  // Excel in Dutch expects semicolons, in English commas; the byte order mark keeps accents intact.
  const csv = toCsv([header, ...csvRows(meta, outcomes, (o, item) => resultText(o, undo, item))], getLang() === "nl" ? ";" : ",");
  const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `replay-${table}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function BulkDialog({ token }: { token: string | null }): ReactElement {
  const s = useStyles();
  const { api, identity, xrm } = useApp();
  const request = useMemo(() => (token ? getRegistry().bulkRequests?.[token] : undefined), [token]);

  const [phase, setPhase] = useState<Phase>("choose");
  const [rows, setRows] = useState<RecordingRow[]>([]);
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState<Msg | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [steps, setSteps] = useState<Step[]>([]);
  const [meta, setMeta] = useState<TableMeta | null>(null);
  const [records, setRecords] = useState<BulkRecord[]>([]);
  const [answers, setAnswers] = useState<Record<string, StoredValue>>({});
  const [showAll, setShowAll] = useState(false);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [undoOutcomes, setUndoOutcomes] = useState<Outcome[]>([]);
  const [last, setLast] = useState<LastRun | undefined>(() => (request ? lastRunFor(request.table) : undefined));
  const control = useRef<RunControl>({ cancelled: false });
  const startedAt = useRef(new Date());

  useEffect(() => {
    if (!request) return;
    listRecordings(api, identity, "all")
      .then((all) => setRows(all.filter((r) => r.table === request.table)))
      .catch((e) => setMessage({ intent: "error", text: t("loadError", errorText(e)) }));
  }, [api, identity, request]);

  const plans = useMemo(() => {
    const map = new Map<string, PlanItem[]>();
    if (!meta) return map;
    const options = { answers, now: startedAt.current, userName: xrm.Utility.getGlobalContext().userSettings.userName, locale: getLang() };
    for (const r of records) if (!r.error) map.set(r.id, planRecord(meta, r, steps, options));
    return map;
  }, [meta, records, steps, answers, xrm]);

  const summary = useMemo(() => summarize(records, plans, steps), [records, plans, steps]);
  const changeCount = summary.steps.reduce((n, x) => n + x.apply, 0);
  const prompts = useMemo(() => steps.filter((x) => x.valueMode === "prompt" && x.operation === "set"), [steps]);
  const unanswered = prompts.some((x) => !(x.column in answers) && summary.steps.find((r) => r.column === x.column)?.skipped.needsInput);

  const onPreview = useCallback(async (): Promise<void> => {
    if (!request || !selected) return;
    setMessage(null);
    setPhase("reading");
    setProgress({ done: 0, total: request.ids.length });
    try {
      const { steps: loaded } = await getRecording(api, selected);
      if (loaded.length === 0) {
        setMessage({ intent: "info", text: t("bulkNoSteps") });
        setPhase("choose");
        return;
      }
      const m = await loadTableMeta(api, request.table, neededColumns(loaded));
      const recs = await loadRecords(api, m, request.ids, (done, total) => setProgress({ done, total }));
      startedAt.current = new Date();
      setSteps(loaded);
      setMeta(m);
      setRecords(recs);
      setAnswers({});
      setShowAll(false);
      setPhase("preview");
    } catch (e) {
      setMessage({ intent: "error", text: t("errorGeneric", errorText(e)) });
      setPhase("choose");
    }
  }, [api, request, selected]);

  const onRun = async (): Promise<void> => {
    if (!request || !meta) return;
    control.current = { cancelled: false, onProgress: (done, total) => setProgress({ done, total }) };
    setProgress({ done: 0, total: records.length });
    setPhase("running");
    try {
      const out = await runBulk(api, meta, records, plans, control.current);
      setOutcomes(out);
      if (out.some((o) => o.status === "applied")) {
        const run: LastRun = { table: request.table, recording: rows.find((r) => r.id === selected)?.name ?? "", at: Date.now(), outcomes: out };
        rememberRun(run);
        setLast(run);
      }
      setPhase("done");
    } catch (e) {
      setMessage({ intent: "error", text: t("errorGeneric", errorText(e)) });
      setPhase("preview");
    }
  };

  const onUndo = async (run: LastRun): Promise<void> => {
    if (!request) return;
    control.current = { cancelled: false, onProgress: (done, total) => setProgress({ done, total }) };
    const targets = run.outcomes.filter((o) => o.status === "applied");
    setProgress({ done: 0, total: targets.length });
    setPhase("undoing");
    try {
      const columns = [...new Set(targets.flatMap((o) => o.changes.map((c) => c.column)))];
      const m = await loadTableMeta(api, request.table, columns);
      const out = await undoRun(api, m, run.outcomes, control.current);
      setMeta(m);
      setUndoOutcomes(out);
      forgetRun(request.table);
      setLast(undefined);
      setPhase("undone");
    } catch (e) {
      setMessage({ intent: "error", text: t("errorGeneric", errorText(e)) });
      setPhase("choose");
    }
  };

  if (!request) return <div className={s.root}><Text>{t("bulkNoSelection")}</Text></div>;

  const count = (list: Outcome[], status: Outcome["status"]): number => list.filter((o) => o.status === status).length;
  const total = records.length;
  const percent = progress.total ? progress.done / progress.total : 0;
  const visible = showAll ? records : records.slice(0, PREVIEW_ROWS);

  const resultTable = (list: Outcome[], undo: boolean): ReactElement => (
    <div className={s.scroll}>
      <table className={s.table}>
        <thead><tr><th className={s.th}>{t("bulkColRecord")}</th><th className={s.th}>{t("bulkColResult")}</th></tr></thead>
        <tbody>
          {list.map((o) => (
            <tr key={o.id}>
              <td className={s.td}>{o.name || o.id}</td>
              <td className={s.td}>{resultText(o, undo)}{undo && o.status === "applied" && o.message ? ` (${t("resultKept")}: ${o.message})` : ""}{undo && o.status === "conflict" && o.message ? `: ${o.message}` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className={s.root}>
      <Title3>{t("bulkTitle")}</Title3>
      <Text className={s.muted}>{t("bulkIntro", request.ids.length)}</Text>
      <Notice message={message} onDismiss={() => setMessage(null)} />

      {phase === "choose" ? (
        <>
          <div className={s.card}>
            {rows.length === 0 ? (
              <Text className={s.muted}>{t("paneNoRecordings")}</Text>
            ) : (
              <>
                <Select value={selected} onChange={(_, d) => setSelected(d.value)} aria-label={t("paneChoose")}>
                  <option value="">{t("paneChoose")}</option>
                  {rows.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.stepCount})</option>)}
                </Select>
                <div className={s.row}>
                  <Button appearance="primary" icon={<Play20Filled />} disabled={!selected} onClick={() => void onPreview()}>{t("panePreview")}</Button>
                </div>
              </>
            )}
          </div>
          {last ? (
            <div className={s.card}>
              <Text>{t("bulkUndoLast", last.recording, last.outcomes.filter((o) => o.status === "applied").length)}</Text>
              <Text size={200} className={s.muted}>{t("bulkUndoNote")}</Text>
              <div className={s.row}><Button icon={<ArrowUndo20Regular />} onClick={() => void onUndo(last)}>{t("bulkUndo")}</Button></div>
            </div>
          ) : null}
        </>
      ) : null}

      {phase === "reading" ? (
        <div className={s.card}>
          <Text>{t("bulkReading", progress.done, progress.total)}</Text>
          <ProgressBar value={percent} />
        </div>
      ) : null}

      {phase === "preview" && meta ? (
        <>
          <MessageBar intent="warning"><MessageBarBody>{t("bulkWarning")}</MessageBarBody></MessageBar>

          {prompts.map((p) => {
            const spec = specFor(p, meta);
            return spec ? (
              <div key={p.column + p.sortOrder} className={s.card}>
                <PromptField spec={spec} value={answers[p.column]} onChange={(v) => setAnswers((prev) => { const next = { ...prev }; if (v === undefined) delete next[p.column]; else next[p.column] = v; return next; })} />
              </div>
            ) : null;
          })}

          <div className={s.card}>
            <Text weight="semibold">{t("bulkSummary", summary.toChange, total, summary.nothing)}</Text>
            {summary.failedToLoad ? <Text size={200} className={s.muted}>{t("bulkUnreadable", summary.failedToLoad)}</Text> : null}
            <table className={s.table}>
              <thead>
                <tr>
                  <th className={s.th}>{t("bulkColColumn")}</th>
                  <th className={s.th}>{t("statusApply")}</th>
                  <th className={s.th}>{t("statusNoop")}</th>
                  <th className={s.th}>{t("statusSkip")}</th>
                </tr>
              </thead>
              <tbody>
                {summary.steps.map((r) => (
                  <tr key={r.column}>
                    <td className={s.td}>{meta.columns.get(r.column)?.label ?? r.column}</td>
                    <td className={s.td}>{r.apply}</td>
                    <td className={s.td}>{r.noop}</td>
                    <td className={s.td}>{Object.entries(r.skipped).map(([reason, n]) => `${n}× ${t(SKIP_REASON_KEYS[reason as keyof typeof SKIP_REASON_KEYS])}`).join("; ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={s.card}>
            <Text weight="semibold">{t("bulkRecords")}</Text>
            <div className={s.scroll}>
              <table className={s.table}>
                <tbody>
                  {visible.map((r) => {
                    const items = plans.get(r.id) ?? [];
                    const changing = items.filter((i) => i.status === "apply");
                    return (
                      <tr key={r.id}>
                        <td className={s.td}>{r.name || r.id}</td>
                        <td className={s.td}>
                          {r.error ? t("resultUnreadable", r.error) : changing.length ? <Badge appearance="tint" color="brand">{changing.map((i) => meta.columns.get(i.step.column)?.label ?? i.step.column).join(", ")}</Badge> : <Badge appearance="tint" color="success">{t("resultUnchanged")}</Badge>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!showAll && records.length > PREVIEW_ROWS ? <div className={s.row}><Button appearance="subtle" size="small" onClick={() => setShowAll(true)}>{t("bulkShowAll", records.length)}</Button></div> : null}
          </div>

          {summary.toChange === 0 ? <Text className={s.muted}>{t("bulkNothing")}</Text> : null}
          {unanswered ? <Text size={200} className={s.muted}>{t("previewUnanswered")}</Text> : null}
          <div className={s.row}>
            <Button appearance="primary" disabled={summary.toChange === 0 || unanswered} onClick={() => setPhase("confirm")}>{t("bulkConfirmButton", summary.toChange)}</Button>
            <Button onClick={() => setPhase("choose")}>{t("cancel")}</Button>
          </div>
        </>
      ) : null}

      {phase === "confirm" ? (
        <div className={s.card}>
          <Text weight="semibold">{t("bulkConfirmTitle", summary.toChange)}</Text>
          <Text>{t("bulkConfirmText", changeCount, summary.toChange)}</Text>
          <div className={s.row}>
            <Button appearance="primary" onClick={() => void onRun()}>{t("bulkConfirmButton", summary.toChange)}</Button>
            <Button onClick={() => setPhase("preview")}>{t("cancel")}</Button>
          </div>
        </div>
      ) : null}

      {phase === "running" || phase === "undoing" ? (
        <div className={s.card}>
          <Text>{t(phase === "running" ? "bulkRunning" : "bulkUndoing", progress.done, progress.total)}</Text>
          <ProgressBar value={percent} />
          <div className={s.row}>
            <Button icon={<Stop20Filled />} onClick={() => { control.current.cancelled = true; }}>{t("bulkStop")}</Button>
            <Spinner size="tiny" />
          </div>
        </div>
      ) : null}

      {phase === "done" && meta ? (
        <>
          <MessageBar intent={count(outcomes, "failed") || count(outcomes, "notStarted") ? "warning" : "success"}>
            <MessageBarBody>
              {count(outcomes, "notStarted")
                ? t("bulkStopped", count(outcomes, "applied"), count(outcomes, "notStarted"))
                : t("bulkDone", count(outcomes, "applied"), count(outcomes, "unchanged"), count(outcomes, "failed"), count(outcomes, "conflict"))}
            </MessageBarBody>
          </MessageBar>
          <div className={s.card}>{resultTable(outcomes, false)}</div>
          <div className={s.row}>
            <Button icon={<ArrowDownload20Regular />} onClick={() => download(request.table, meta, outcomes, false)}>{t("bulkDownload")}</Button>
            {last ? <Button icon={<ArrowUndo20Regular />} onClick={() => void onUndo(last)}>{t("bulkUndo")}</Button> : null}
          </div>
          {last ? <Text size={200} className={s.muted}>{t("bulkUndoNote")}</Text> : null}
        </>
      ) : null}

      {phase === "undone" && meta ? (
        <>
          <MessageBar intent={count(undoOutcomes, "failed") ? "warning" : "success"}>
            <MessageBarBody>{t("bulkUndone", count(undoOutcomes, "applied"), count(undoOutcomes, "conflict"), count(undoOutcomes, "failed"))}</MessageBarBody>
          </MessageBar>
          <div className={s.card}>{resultTable(undoOutcomes, true)}</div>
          <div className={s.row}>
            <Button icon={<ArrowDownload20Regular />} onClick={() => download(request.table, meta, undoOutcomes, true)}>{t("bulkDownload")}</Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
