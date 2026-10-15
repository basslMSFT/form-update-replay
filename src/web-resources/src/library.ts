import { entryFromForm, getRegistry } from "./registry";

/**
 * Command-bar entry point (global command on the main form). It remembers the form for the focused session and opens
 * the Form Update Replay side pane. All real work happens in the pane so this file stays tiny and loads fast.
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

(window as unknown as { FormUpdateReplay: unknown }).FormUpdateReplay = {
  openPanel: (fc: Xrm.FormContext) => {
    openPanel(fc).catch((e: unknown) => {
      Xrm.Navigation.openErrorDialog({ message: e instanceof Error ? e.message : String(e) });
    });
  },
};
