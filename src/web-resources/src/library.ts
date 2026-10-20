import { entryFromForm, getRegistry } from "./registry";
import { gridTable, isAvailable, isGridAvailable } from "./visibility";
import { MAX_RECORDS } from "./model";
import { langFromLcid, setLang, t } from "./i18n";
import { cleanGuid } from "./value-codec";

/**
 * Command-bar entry points. The form button opens the Form Update Replay side pane; the grid button opens the bulk
 * dialog for the selected records. All real work happens in the hub bundle so this file stays tiny and loads fast.
 */
const PANE_ID = "msftnl_formupdatereplay";
const HUB = "msftnl_/furep/html/furep.hub.html";
const ICON = "msftnl_/furep/img/furep.svg";

async function openPanel(fc: Xrm.FormContext): Promise<void> {
  if (fc?.data?.entity) {
    const entry = entryFromForm(fc);
    getRegistry().forms[entry.key] = entry;
  }
  const panes = Xrm.App.sidePanes;
  const title = "Replay";
  // The same logo as the command button, so the pane is recognisable in the side pane bar.
  const imageSrc = `${Xrm.Utility.getGlobalContext().getClientUrl()}/WebResources/${ICON}`;
  const pane = panes.getPane(PANE_ID) ?? (await panes.createPane({ title, paneId: PANE_ID, canClose: true, width: 420, isSelected: true, imageSrc, hideHeader: false }));
  // A collapsed pane never shows its content, so expand it before selecting.
  panes.state = 1;
  pane.select();
  // The changing value forces a fresh load so the list of recordings is always current.
  await pane.navigate({ pageType: "webresource", webresourceName: HUB, data: `mode=pane&t=${Date.now()}` });
}

async function openBulk(control: unknown, ids: string[] | undefined): Promise<void> {
  setLang(langFromLcid(Xrm.Utility.getGlobalContext().userSettings.languageId));
  const table = gridTable(control);
  const selected = (ids ?? []).map(cleanGuid).filter(Boolean);
  if (!table || selected.length === 0) {
    await Xrm.Navigation.openAlertDialog({ text: t("bulkNoSelection") });
    return;
  }
  if (selected.length > MAX_RECORDS) {
    await Xrm.Navigation.openAlertDialog({ text: t("bulkTooMany", MAX_RECORDS, selected.length) });
    return;
  }
  // The ids travel through the top window: a long selection would not fit in the dialog's query string.
  const token = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  (getRegistry().bulkRequests ??= {})[token] = { table, ids: selected };
  try {
    await Xrm.Navigation.navigateTo(
      { pageType: "webresource", webresourceName: HUB, data: `mode=bulk&token=${token}` },
      { target: 2, position: 1, width: { value: 70, unit: "%" }, height: { value: 85, unit: "%" }, title: t("bulkTitle") },
    );
  } finally {
    delete getRegistry().bulkRequests![token];
  }
  // The grid shows the old values until it is told to reload.
  try {
    (control as { refresh?: () => void }).refresh?.();
  } catch {
    /* a grid that cannot refresh keeps showing the old values until the user reloads it */
  }
}

function report(e: unknown): void {
  Xrm.Navigation.openErrorDialog({ message: e instanceof Error ? e.message : String(e) });
}

(window as unknown as { FormUpdateReplay: unknown }).FormUpdateReplay = {
  openPanel: (fc: Xrm.FormContext) => {
    openPanel(fc).catch(report);
  },
  // Grid command: the selected grid and the ids of its selected rows.
  openBulk: (control: unknown, ids: string[]) => {
    openBulk(control, ids).catch(report);
  },
  // Command-bar display rules: decide per app and table whether the buttons are shown (see visibility.ts).
  isAvailable: (table?: string) => isAvailable(table),
  isGridAvailable: (control: unknown) => isGridAvailable(control),
};
