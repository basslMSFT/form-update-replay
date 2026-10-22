import { KeyboardEvent, ReactElement, useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge, Button, Input, Spinner, Tab, TabList, Table, TableBody, TableCell, TableCellLayout, TableHeader, TableHeaderCell, TableRow,
  TableRowId, TableSelectionCell, Text, Textarea, Title2, createTableColumn, makeStyles, mergeClasses, tokens, useTableFeatures, useTableSelection,
} from "@fluentui/react-components";
import { ArrowLeft20Regular, ArrowSync20Regular, Delete20Regular, Dismiss16Regular, Edit20Regular, Open20Regular, PeopleTeam20Regular, Person20Regular, Search20Regular, Share20Regular } from "@fluentui/react-icons";
import { RecordingRow, Scope, ShareEntry, getRecording, getShares, listRecordings, loadTeamIds, replaceSteps, revokeAccess, updateRecordingHeader } from "../store";
import { Step } from "../model";
import { ColumnInfo, loadColumns } from "../compat";
import { StepsEditor, stepsValid } from "./StepsEditor";
import { AssignDialog, DeleteDialog, DoneHandler, RenameDialog, ShareDialog } from "./Dialogs";
import { Msg, Notice } from "./Notice";
import { Field } from "./fields";
import { errorText, useApp } from "./context";
import { getLang, t } from "../i18n";

const useStyles = makeStyles({
  root: {
    display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM, padding: tokens.spacingHorizontalXXL, height: "100vh", boxSizing: "border-box", overflow: "auto",
    backgroundImage: `linear-gradient(180deg, ${tokens.colorBrandBackground2} 0px, ${tokens.colorNeutralBackground1} 220px)`,
  },
  toolbar: { display: "flex", gap: tokens.spacingHorizontalM, alignItems: "center", flexWrap: "wrap" },
  commands: {
    display: "flex", alignItems: "center", flexWrap: "wrap", gap: tokens.spacingHorizontalXS,
    backgroundColor: tokens.colorNeutralBackground3, border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
  },
  grow: { flexGrow: 1 },
  muted: { color: tokens.colorNeutralForeground3 },
  detail: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM, maxWidth: "1400px" },
  columns: {
    display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 360px)", gap: tokens.spacingHorizontalXL, alignItems: "start",
    "@media (max-width: 860px)": { gridTemplateColumns: "minmax(0, 1fr)" },
  },
  main: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM, minWidth: 0 },
  side: {
    display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM, minWidth: 0,
    position: "sticky", top: 0,
    "@media (max-width: 860px)": { order: -1, position: "static" },
  },
  hero: {
    display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXXS,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    backgroundImage: `linear-gradient(90deg, ${tokens.colorBrandBackground2} 0%, ${tokens.colorNeutralBackground1} 100%)`,
    borderLeft: `4px solid ${tokens.colorBrandBackground}`, borderRadius: tokens.borderRadiusMedium, boxShadow: tokens.shadow4,
  },
  panel: {
    display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS,
    backgroundColor: tokens.colorNeutralBackground3, border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingHorizontalM,
  },
  section: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS, paddingBottom: tokens.spacingVerticalXXS, borderBottom: `2px solid ${tokens.colorBrandBackground}` },
  shareRow: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: tokens.spacingHorizontalS, padding: `${tokens.spacingVerticalXS} 0` },
  headCell: { fontWeight: tokens.fontWeightSemibold, color: tokens.colorBrandForeground1 },
  thead: { backgroundImage: `linear-gradient(90deg, ${tokens.colorBrandBackground2} 0%, ${tokens.colorNeutralBackground1} 100%)` },
  row: { backgroundColor: tokens.colorNeutralBackground1, ":hover": { backgroundColor: tokens.colorBrandBackground2Hover } },
  rowSelected: { backgroundColor: tokens.colorBrandBackground2, ":hover": { backgroundColor: tokens.colorBrandBackground2Hover } },
  link: {
    color: tokens.colorBrandForegroundLink,
    cursor: "pointer",
    fontWeight: tokens.fontWeightSemibold,
    textDecorationLine: "none",
    ":hover": { textDecorationLine: "underline", color: tokens.colorBrandForegroundLinkHover },
    ":focus-visible": { textDecorationLine: "underline" },
  },
});

type Action = { kind: "rename"; rows: RecordingRow[] } | { kind: "share" | "assign" | "delete"; rows: RecordingRow[] } | null;

export function sharedLabel(row: Pick<RecordingRow, "sharedCount">): string {
  if (row.sharedCount === undefined) return "—";
  return row.sharedCount > 0 ? `${t("yes")} (${row.sharedCount})` : t("no");
}

const COLUMNS = [createTableColumn<RecordingRow>({ columnId: "name" })];

export function Hub(): ReactElement {
  const s = useStyles();
  const { api, identity: initialIdentity } = useApp();
  const [identity, setIdentity] = useState(initialIdentity);
  const [tab, setTab] = useState<Scope>("mine");
  const [rows, setRows] = useState<RecordingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<Msg | null>(null);
  const [action, setAction] = useState<Action>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Team membership can change while the dialog is open, so read it again before placing recordings on tabs.
      const teamIds = await loadTeamIds(api, initialIdentity.userId);
      const who = { ...initialIdentity, teamIds };
      setIdentity(who);
      setRows(await listRecordings(api, who, tab));
    } catch (e) {
      setMessage({ intent: "error", text: t("loadError", errorText(e)) });
    } finally {
      setLoading(false);
    }
  }, [api, initialIdentity, tab]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => `${r.name} ${r.table} ${r.ownerName}`.toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  const [selected, setSelected] = useState<Set<TableRowId>>(new Set());
  const { selection } = useTableFeatures({ columns: COLUMNS, items: visible, getRowId: (r) => r.id }, [
    useTableSelection({ selectionMode: "multiselect", selectedItems: selected, onSelectionChange: (_, data) => setSelected(new Set(data.selectedItems)) }),
  ]);
  // A new list (other tab, refresh, search) starts without a selection so actions never hit rows that are no longer shown.
  useEffect(() => { setSelected(new Set()); }, [visible]);

  const picked = useMemo(() => visible.filter((r) => selection.isRowSelected(r.id)), [visible, selection]);
  const single = picked.length === 1 ? picked[0]! : null;

  const done: DoneHandler = (text, intent = "success") => {
    setAction(null);
    setMessage({ intent, text });
    void load();
  };

  if (openId) {
    return <Detail id={openId} onBack={() => { setOpenId(null); void load(); }} />;
  }

  const fmt = (iso: string): string => (iso ? new Date(iso).toLocaleString(getLang()) : "");
  const onSpace = (toggle: (e: KeyboardEvent<HTMLElement>) => void) => (e: KeyboardEvent<HTMLElement>): void => {
    if (e.key === " ") { e.preventDefault(); toggle(e); }
  };

  return (
    <div className={s.root}>
      <div>
        <Title2 block>{t("recordingsTitle")}</Title2>
        <Text className={s.muted}>{t("recordingsSubtitle")}</Text>
      </div>

      <TabList selectedValue={tab} onTabSelect={(_, d) => { setTab(d.value as Scope); setMessage(null); }}>
        <Tab value="mine">{t("tabMine")}</Tab>
        <Tab value="sharedby">{t("tabSharedByMe")}</Tab>
        <Tab value="shared">{t("tabShared")}</Tab>
        <Tab value="team">{t("tabTeam")}</Tab>
        {identity.isAdmin ? <Tab value="all">{t("tabAll")}</Tab> : null}
      </TabList>

      <div className={s.toolbar}>
        <Input className={s.grow} contentBefore={<Search20Regular />} placeholder={t("search")} value={search} onChange={(_, d) => setSearch(d.value)} aria-label={t("search")} />
        <Button icon={<ArrowSync20Regular />} onClick={() => void load()}>{t("refresh")}</Button>
      </div>

      <Notice message={message} onDismiss={() => setMessage(null)} />

      <div className={s.commands} role="toolbar" aria-label={t("recordingsTitle")}>
        <Button appearance="transparent" icon={<Open20Regular />} disabled={!single} onClick={() => single && setOpenId(single.id)}>{t("open")}</Button>
        <Button appearance="transparent" icon={<Edit20Regular />} disabled={!single} onClick={() => single && setAction({ kind: "rename", rows: [single] })}>{t("rename")}</Button>
        <Button appearance="transparent" icon={<Share20Regular />} disabled={picked.length === 0} onClick={() => setAction({ kind: "share", rows: picked })}>{t("share")}</Button>
        <Button appearance="transparent" icon={<PeopleTeam20Regular />} disabled={picked.length === 0} onClick={() => setAction({ kind: "assign", rows: picked })}>{t("assignTeam")}</Button>
        <Button appearance="transparent" icon={<Delete20Regular />} disabled={picked.length === 0} onClick={() => setAction({ kind: "delete", rows: picked })}>{t("delete")}</Button>
        <Text className={s.muted} style={{ marginLeft: "auto" }}>{picked.length > 0 ? t("selectedCount", picked.length) : ""}</Text>
      </div>

      {loading ? <Spinner label={t("loading")} /> : visible.length === 0 ? (
        <Text className={s.muted}>{t("empty")}</Text>
      ) : (
        <Table aria-label={t("recordingsTitle")}>
          <TableHeader className={s.thead}>
            <TableRow>
              <TableSelectionCell
                checked={selection.allRowsSelected ? true : selection.someRowsSelected ? "mixed" : false}
                onClick={selection.toggleAllRows}
                onKeyDown={onSpace(selection.toggleAllRows)}
                checkboxIndicator={{ "aria-label": t("selectAll"), shape: "circular" }}
              />
              <TableHeaderCell className={s.headCell}>{t("colName")}</TableHeaderCell>
              <TableHeaderCell className={s.headCell}>{t("colTable")}</TableHeaderCell>
              <TableHeaderCell className={s.headCell}>{t("colSteps")}</TableHeaderCell>
              <TableHeaderCell className={s.headCell}>{t("colShared")}</TableHeaderCell>
              <TableHeaderCell className={s.headCell}>{t("colOwner")}</TableHeaderCell>
              <TableHeaderCell className={s.headCell}>{t("colModified")}</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((r) => {
              const isSelected = selection.isRowSelected(r.id);
              return (
                <TableRow key={r.id} aria-selected={isSelected} className={mergeClasses(s.row, isSelected && s.rowSelected)}>
                  <TableSelectionCell
                    checked={isSelected}
                    onClick={(e) => selection.toggleRow(e, r.id)}
                    onKeyDown={onSpace((e) => selection.toggleRow(e, r.id))}
                    checkboxIndicator={{ "aria-label": `${t("selectRow")}: ${r.name}`, shape: "circular" }}
                  />
                  <TableCell>
                    <TableCellLayout><a className={s.link} role="link" tabIndex={0} onClick={() => setOpenId(r.id)} onKeyDown={(e) => { if (e.key === "Enter") setOpenId(r.id); }}>{r.name}</a></TableCellLayout>
                  </TableCell>
                  <TableCell><TableCellLayout>{r.table}</TableCellLayout></TableCell>
                  <TableCell><TableCellLayout>{r.stepCount}</TableCellLayout></TableCell>
                  <TableCell><TableCellLayout>{sharedLabel(r)}</TableCellLayout></TableCell>
                  <TableCell><TableCellLayout media={r.ownerType === "team" ? <PeopleTeam20Regular /> : undefined}>{r.ownerId === identity.userId ? t("you") : r.ownerName}</TableCellLayout></TableCell>
                  <TableCell><TableCellLayout>{fmt(r.modifiedOn)}</TableCellLayout></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {action?.kind === "rename" ? <RenameDialog row={action.rows[0]!} onClose={() => setAction(null)} onDone={done} /> : null}
      {action?.kind === "share" ? <ShareDialog rows={action.rows} onClose={() => setAction(null)} onDone={done} /> : null}
      {action?.kind === "assign" ? <AssignDialog rows={action.rows} onClose={() => setAction(null)} onDone={done} /> : null}
      {action?.kind === "delete" ? <DeleteDialog rows={action.rows} onClose={() => setAction(null)} onDone={done} /> : null}
    </div>
  );
}

/** Values of "ask" and "copy" steps are never stored, so drop what is only kept in memory after a save. */
const withoutMemoryValues = (steps: Step[]): Step[] => steps.map((x) => (x.valueMode === "fixed" ? x : { ...x, value: undefined }));

function Detail({ id, onBack }: { id: string; onBack: () => void }): ReactElement {
  const s = useStyles();
  const { api, xrm, identity } = useApp();
  const [row, setRow] = useState<RecordingRow | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [shares, setShares] = useState<ShareEntry[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [optionLabels, setOptionLabels] = useState<Record<string, Record<string, string>>>({});
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [message, setMessage] = useState<Msg | null>(null);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);

  const loadShares = useCallback(async (ownerId: string) => {
    try {
      setShares(await getShares(api, id, ownerId));
    } catch {
      setShares([]);
    }
  }, [api, id]);

  useEffect(() => {
    getRecording(api, id)
      .then(async ({ row: r, steps: st }) => {
        setRow(r);
        setSteps(st);
        setName(r.name);
        setDescription(r.description);
        void loadShares(r.ownerId);
        loadColumns(api, r.table).then(setColumns).catch(() => setColumns([]));
        try {
          const md = (await xrm.Utility.getEntityMetadata(r.table, st.filter((x) => x.operation !== "addRelated").map((x) => x.column))) as unknown as { Attributes: { get(n: string): { DisplayName?: string; OptionSet?: Record<string, { text?: string; value?: number }> } | undefined } };
          const l: Record<string, string> = {};
          const ol: Record<string, Record<string, string>> = {};
          for (const x of st) {
            if (x.operation === "addRelated") continue;
            const a = md.Attributes.get(x.column);
            if (a?.DisplayName) l[x.column] = a.DisplayName;
            if (a?.OptionSet) {
              const m: Record<string, string> = {};
              for (const k of Object.keys(a.OptionSet)) { const o = a.OptionSet[k]; if (o?.text) m[String(o.value ?? k)] = o.text; }
              ol[x.column] = m;
            }
          }
          setLabels(l);
          setOptionLabels(ol);
        } catch {
          // labels are optional; logical names are shown instead
        }
      })
      .catch((e) => setMessage({ intent: "error", text: t("loadError", errorText(e)) }));
  }, [api, id, xrm, loadShares]);

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      await updateRecordingHeader(api, id, { name: name.trim(), description });
      await replaceSteps(api, id, steps.map((x, i) => ({ ...x, sortOrder: (i + 1) * 10 })));
      setSteps(withoutMemoryValues(steps));
      setMessage({ intent: "success", text: t("saved") });
    } catch (e) {
      setMessage({ intent: "error", text: t("errorGeneric", errorText(e)) });
    } finally {
      setSaving(false);
    }
  };

  const stopSharing = async (entry: ShareEntry): Promise<void> => {
    try {
      await revokeAccess(api, id, entry.principal);
      setMessage({ intent: "success", text: t("stoppedSharing", entry.principal.name) });
      if (row) await loadShares(row.ownerId);
    } catch (e) {
      setMessage({ intent: "error", text: t("errorGeneric", errorText(e)) });
    }
  };

  if (!row) return <div className={s.root}>{message ? <Notice message={message} onDismiss={() => setMessage(null)} /> : <Spinner label={t("loading")} />}</div>;

  const canManageSharing = row.ownerId === identity.userId || identity.isAdmin;

  return (
    <div className={s.root}>
      <div><Button appearance="subtle" icon={<ArrowLeft20Regular />} onClick={onBack}>{t("back")}</Button></div>
      <div className={s.detail}>
        <div className={s.hero}>
          <Title2>{row.name}</Title2>
          <Text className={s.muted}>{row.table} · {steps.length} {t("colSteps").toLowerCase()} · {t("colOwner")}: {row.ownerId === identity.userId ? t("you") : row.ownerName}</Text>
        </div>
        <Notice message={message} onDismiss={() => setMessage(null)} />
        <div className={s.columns}>
          <div className={s.main}>
            <div className={s.panel}>
              <Field label={t("fieldName")} required><Input value={name} onChange={(_, d) => setName(d.value)} /></Field>
              <Field label={t("fieldDescription")}><Textarea value={description} onChange={(_, d) => setDescription(d.value)} /></Field>
            </div>
            <div className={s.section}><Text weight="semibold" size={500}>{t("stepsTitle")}</Text><Badge appearance="filled" color="brand" shape="circular">{steps.length}</Badge></div>
            <StepsEditor steps={steps} onChange={setSteps} labels={labels} optionLabels={optionLabels} columns={columns} />
            <div><Button appearance="primary" disabled={saving || !name.trim() || !stepsValid(steps)} onClick={() => void save()}>{t("save")}</Button></div>
          </div>

          <div className={s.side}>
            <div className={s.section}><Text weight="semibold" size={500}>{t("sharedWithTitle")}</Text></div>
            <div className={s.panel}>
              {shares.length === 0 ? <Text className={s.muted}>{t("notShared")}</Text> : shares.map((e) => (
                <div key={`${e.principal.type}:${e.principal.id}`} className={s.shareRow}>
                  {e.principal.type === "team" ? <PeopleTeam20Regular /> : <Person20Regular />}
                  <Text className={s.grow}>{e.principal.name}</Text>
                  <Badge appearance="tint" color={e.canWrite ? "brand" : "informative"}>{e.canWrite ? t("accessWrite") : t("accessRead")}</Badge>
                  {canManageSharing ? (
                    <Button size="small" appearance="outline" icon={<Dismiss16Regular />} aria-label={`${t("stopSharing")}: ${e.principal.name}`} onClick={() => void stopSharing(e)}>{t("stopSharing")}</Button>
                  ) : null}
                </div>
              ))}
              {canManageSharing ? <div><Button icon={<Share20Regular />} onClick={() => setSharing(true)}>{t("share")}</Button></div> : null}
            </div>
          </div>
        </div>
      </div>
      {sharing ? <ShareDialog rows={[row]} onClose={() => setSharing(false)} onDone={(text, intent = "success") => { setSharing(false); setMessage({ intent, text }); void loadShares(row.ownerId); }} /> : null}
    </div>
  );
}
