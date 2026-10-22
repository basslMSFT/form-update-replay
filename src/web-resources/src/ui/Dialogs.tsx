import { ReactElement, useEffect, useMemo, useState } from "react";
import {
  Button, Checkbox, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Input, MessageBar, MessageBarBody,
  Radio, RadioGroup, Select, Spinner, Text, makeStyles, tokens,
} from "@fluentui/react-components";
import {
  BusinessUnit, Principal, RecordingRow, UnitScope, assignToTeam, defaultTeams, deleteRecording, grantAccess, listBusinessUnits, searchPrincipals, unitsForScope, updateRecordingHeader,
} from "../store";
import { Field } from "./fields";
import { errorText, useApp } from "./context";
import { t } from "../i18n";

const useStyles = makeStyles({
  list: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXS, maxHeight: "200px", overflowY: "auto" },
  col: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM },
});

export type DoneHandler = (message: string, intent?: "success" | "error") => void;

interface DialogProps {
  rows: RecordingRow[];
  onClose: () => void;
  onDone: DoneHandler;
}

const heading = (rows: RecordingRow[]): string => (rows.length === 1 ? rows[0]!.name : t("nRecordings", rows.length));

/** Runs the action for every recording and reports what failed, so one bad row does not hide the rest. */
async function runBulk(rows: RecordingRow[], action: (row: RecordingRow) => Promise<void>): Promise<{ done: number; failed: string[] }> {
  let done = 0;
  const failed: string[] = [];
  for (const row of rows) {
    try {
      await action(row);
      done++;
    } catch (e) {
      failed.push(`${row.name}: ${errorText(e)}`);
    }
  }
  return { done, failed };
}

function finish(rows: RecordingRow[], res: { done: number; failed: string[] }, success: string, onDone: DoneHandler): void {
  if (res.failed.length === 0) onDone(success);
  else onDone(t("bulkPartial", res.done, rows.length, res.failed.join("; ")), "error");
}

/** Finds users or teams by name; shared by the share and assign dialogs. */
function usePrincipalSearch(text: string, only?: Principal["type"]): { results: Principal[]; busy: boolean } {
  const { api } = useApp();
  const [results, setResults] = useState<Principal[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (text.trim().length < 2) { setResults([]); return; }
    let cancelled = false;
    setBusy(true);
    const timer = window.setTimeout(() => {
      searchPrincipals(api, text.trim(), only === "team")
        .then((r) => { if (!cancelled) setResults(only ? r.filter((p) => p.type === only) : r); })
        .catch(() => { if (!cancelled) setResults([]); })
        .finally(() => { if (!cancelled) setBusy(false); });
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [text, api, only]);
  return { results, busy };
}

export function ShareDialog({ rows, onClose, onDone }: DialogProps): ReactElement {
  const s = useStyles();
  const { api } = useApp();
  const [mode, setMode] = useState<"people" | "unit">("people");
  const [text, setText] = useState("");
  const [picked, setPicked] = useState("");
  const [canWrite, setCanWrite] = useState(false);
  const [saving, setSaving] = useState(false);
  const { results, busy } = usePrincipalSearch(mode === "people" ? text : "");
  const principal = results.find((p) => `${p.type}:${p.id}` === picked);

  const [units, setUnits] = useState<BusinessUnit[]>([]);
  const [unitId, setUnitId] = useState("");
  const [scope, setScope] = useState<UnitScope>("unit");
  const [unitError, setUnitError] = useState("");
  useEffect(() => {
    if (mode !== "unit" || units.length) return;
    listBusinessUnits(api).then(setUnits).catch((e) => setUnitError(errorText(e)));
  }, [mode, units.length, api]);
  const covered = useMemo(() => (unitId ? unitsForScope(units, unitId, scope) : []), [units, unitId, scope]);

  const submit = async (): Promise<void> => {
    if (!principal) return;
    setSaving(true);
    const res = await runBulk(rows, (r) => grantAccess(api, r.id, principal, canWrite));
    finish(rows, res, rows.length === 1 ? t("shareDone", principal.name) : t("shareDoneMany", res.done, principal.name), onDone);
  };

  const submitUnits = async (): Promise<void> => {
    if (covered.length === 0) return;
    setSaving(true);
    try {
      const teams = await defaultTeams(api, covered.map((u) => u.id));
      if (teams.length === 0) { setUnitError(t("shareUnitNoTeams")); setSaving(false); return; }
      const res = await runBulk(rows, async (r) => {
        const failed: string[] = [];
        for (const team of teams) await grantAccess(api, r.id, team, canWrite).catch((e) => failed.push(`${team.name}: ${errorText(e)}`));
        if (failed.length) throw new Error(failed.join(", "));
      });
      finish(rows, res, t("shareUnitDone", teams.length), onDone);
    } catch (e) {
      setUnitError(errorText(e));
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(_, d) => { if (!d.open) onClose(); }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{t("shareTitle")}: {heading(rows)}</DialogTitle>
          <DialogContent className={s.col}>
            <RadioGroup layout="horizontal" value={mode} onChange={(_, d) => setMode(d.value as "people" | "unit")}>
              <Radio value="people" label={t("shareModePeople")} />
              <Radio value="unit" label={t("shareModeUnit")} />
            </RadioGroup>
            {mode === "people" ? (
              <>
                <Field label={t("shareSearch")}>
                  <Input value={text} onChange={(_, d) => { setText(d.value); setPicked(""); }} contentAfter={busy ? <Spinner size="extra-tiny" /> : undefined} />
                </Field>
                <RadioGroup value={picked} onChange={(_, d) => setPicked(d.value)} className={s.list}>
                  {results.map((p) => <Radio key={`${p.type}:${p.id}`} value={`${p.type}:${p.id}`} label={`${p.name} (${p.type === "team" ? t("shareTeam") : t("shareUser")})`} />)}
                </RadioGroup>
                {text.trim().length >= 2 && !busy && results.length === 0 ? <Text>{t("shareNoResults")}</Text> : null}
              </>
            ) : (
              <>
                {unitError ? <MessageBar intent="error"><MessageBarBody>{unitError}</MessageBarBody></MessageBar> : null}
                <Field label={t("shareUnitPick")}>
                  <Select value={unitId} onChange={(_, d) => setUnitId(d.value)}>
                    <option value="">{t("shareUnitChoose")}</option>
                    {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </Select>
                </Field>
                <RadioGroup value={scope} onChange={(_, d) => setScope(d.value as UnitScope)}>
                  <Radio value="unit" label={t("scopeUnit")} />
                  <Radio value="below" label={t("scopeBelow")} />
                  <Radio value="above" label={t("scopeAbove")} />
                  <Radio value="branch" label={t("scopeBranch")} />
                </RadioGroup>
                {covered.length ? <Text size={200}>{t("shareUnitCovers", covered.length, covered.map((u) => u.name).join(", "))}</Text> : null}
                <MessageBar intent="info"><MessageBarBody>{t("shareUnitSnapshot")}</MessageBarBody></MessageBar>
              </>
            )}
            <Text size={200}>{t("shareRead")}</Text>
            <Checkbox label={t("shareWrite")} checked={canWrite} onChange={(_, d) => setCanWrite(d.checked === true)} />
          </DialogContent>
          <DialogActions>
            {mode === "people" ? (
              <Button appearance="primary" disabled={!principal || saving} onClick={() => void submit()}>{t("shareGrant")}</Button>
            ) : (
              <Button appearance="primary" disabled={covered.length === 0 || saving} onClick={() => void submitUnits()}>{t("shareUnitGrant")}</Button>
            )}
            <Button onClick={onClose}>{t("cancel")}</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

export function AssignDialog({ rows, onClose, onDone }: DialogProps): ReactElement {
  const s = useStyles();
  const { api } = useApp();
  const [text, setText] = useState("");
  const [picked, setPicked] = useState("");
  const [saving, setSaving] = useState(false);
  const { results, busy } = usePrincipalSearch(text, "team");
  const team = results.find((p) => p.id === picked);

  const submit = async (): Promise<void> => {
    if (!team) return;
    setSaving(true);
    const res = await runBulk(rows, (r) => assignToTeam(api, r.id, team.id));
    finish(rows, res, rows.length === 1 ? t("assignDone", team.name) : t("assignDoneMany", res.done, team.name), onDone);
  };

  return (
    <Dialog open onOpenChange={(_, d) => { if (!d.open) onClose(); }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{t("assignTitle")}: {heading(rows)}</DialogTitle>
          <DialogContent className={s.col}>
            <Text>{t("assignHint")}</Text>
            <Field label={t("shareSearch")}>
              <Input value={text} onChange={(_, d) => { setText(d.value); setPicked(""); }} contentAfter={busy ? <Spinner size="extra-tiny" /> : undefined} />
            </Field>
            <RadioGroup value={picked} onChange={(_, d) => setPicked(d.value)} className={s.list}>
              {results.map((p) => <Radio key={p.id} value={p.id} label={p.name} />)}
            </RadioGroup>
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" disabled={!team || saving} onClick={() => void submit()}>{t("assignTeam")}</Button>
            <Button onClick={onClose}>{t("cancel")}</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

export function RenameDialog({ row, onClose, onDone }: { row: RecordingRow; onClose: () => void; onDone: DoneHandler }): ReactElement {
  const { api } = useApp();
  const [name, setName] = useState(row.name);
  const [error, setError] = useState("");
  const submit = async (): Promise<void> => {
    try {
      await updateRecordingHeader(api, row.id, { name: name.trim() });
      onDone(t("saved"));
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <Dialog open onOpenChange={(_, d) => { if (!d.open) onClose(); }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{t("rename")}</DialogTitle>
          <DialogContent>
            {error ? <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar> : null}
            <Field label={t("fieldName")}><Input value={name} onChange={(_, d) => setName(d.value)} /></Field>
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" disabled={!name.trim()} onClick={() => void submit()}>{t("save")}</Button>
            <Button onClick={onClose}>{t("cancel")}</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

export function DeleteDialog({ rows, onClose, onDone }: DialogProps): ReactElement {
  const { api } = useApp();
  const [saving, setSaving] = useState(false);
  const submit = async (): Promise<void> => {
    setSaving(true);
    const res = await runBulk(rows, (r) => deleteRecording(api, r.id));
    finish(rows, res, rows.length === 1 ? t("deleted") : t("deletedMany", res.done), onDone);
  };
  return (
    <Dialog open onOpenChange={(_, d) => { if (!d.open) onClose(); }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{t("confirmDeleteTitle")}</DialogTitle>
          <DialogContent>
            <Text>{rows.length === 1 ? t("confirmDeleteText", rows[0]!.name, rows[0]!.stepCount) : t("confirmDeleteMany", rows.length)}</Text>
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" disabled={saving} onClick={() => void submit()}>{t("delete")}</Button>
            <Button onClick={onClose}>{t("cancel")}</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
