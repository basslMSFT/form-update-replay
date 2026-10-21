/**
 * Decides where the Replay button is shown. Two environment-wide settings (editable per app in solution explorer) hold
 * lists of app unique names and table logical names. The default for apps is "none", so nothing shows until an admin
 * turns Replay on. Roles are checked separately by the command bar itself (a privilege rule on the recording table).
 */
export const APPS_SETTING = "bassllab_FormUpdateReplay_Apps";
export const TABLES_SETTING = "bassllab_FormUpdateReplay_Tables";
/** The same two lists for the bulk replay button in grids; off by default because it changes many records at once. */
export const GRID_APPS_SETTING = "bassllab_FormUpdateReplay_GridApps";
export const GRID_TABLES_SETTING = "bassllab_FormUpdateReplay_GridTables";

/** Splits a setting value on commas, semicolons and whitespace; case-insensitive. */
export function parseList(raw: unknown): string[] {
  return String(raw ?? "")
    .toLowerCase()
    .split(/[\s,;]+/)
    .filter(Boolean);
}

/**
 * True when `name` is allowed by the list.
 *  - "*" allows everything, "none" (or an empty list) allows nothing.
 *  - A name starting with "-" excludes it, for example "*,-lead" or just "-lead".
 */
export function matchesList(raw: unknown, name: string | null | undefined): boolean {
  const target = String(name ?? "").toLowerCase();
  if (!target) return false;
  const tokens = parseList(raw);
  const excludes = tokens.filter((t) => t.startsWith("-")).map((t) => t.slice(1));
  if (excludes.includes(target)) return false;
  const includes = tokens.filter((t) => !t.startsWith("-") && t !== "none");
  if (includes.includes("*")) return true;
  if (!includes.length) return excludes.length > 0; // only exclusions: everything else is allowed
  return includes.includes(target);
}

/** Combines the two lists. */
export function isAvailableFor(appsValue: unknown, tablesValue: unknown, appName: string | null | undefined, table: string | null | undefined): boolean {
  return matchesList(appsValue, appName) && matchesList(tablesValue, table);
}

type GlobalContextWithSettings = Xrm.GlobalContext & {
  getCurrentAppSetting?: (name: string) => unknown;
  getCurrentAppProperties?: () => Promise<{ uniqueName?: string }>;
};

function globalContext(): GlobalContextWithSettings {
  return Xrm.Utility.getGlobalContext() as GlobalContextWithSettings;
}

function pageTable(): string | null {
  try {
    const pc = (Xrm.Utility as unknown as { getPageContext?: () => { input?: { entityName?: string } } }).getPageContext?.();
    return pc?.input?.entityName ?? null;
  } catch {
    return null;
  }
}

let cachedApp: Promise<string | undefined> | null = null;

/** The current app never changes during a page session, so look it up once. */
function currentAppName(gc: GlobalContextWithSettings): Promise<string | undefined> {
  if (!cachedApp) {
    cachedApp = Promise.resolve(gc.getCurrentAppProperties?.()).then(
      (p) => p?.uniqueName,
      () => {
        cachedApp = null; // allow a retry on the next evaluation
        return undefined;
      },
    );
  }
  return cachedApp;
}

/**
 * Ribbon display rule. Asynchronous because the current app's unique name is only available through a promise.
 * Any failure hides the button; a button that is wrongly hidden is safer than one that is wrongly shown.
 * This only controls what is shown. Access to the data is always enforced by Dataverse security roles.
 */
export async function isAvailable(table?: string | null): Promise<boolean> {
  return allowed(APPS_SETTING, TABLES_SETTING, table || pageTable());
}

async function allowed(appsSetting: string, tablesSetting: string, table: string | null | undefined): Promise<boolean> {
  try {
    const gc = globalContext();
    const app = await currentAppName(gc);
    return isAvailableFor(gc.getCurrentAppSetting?.(appsSetting), gc.getCurrentAppSetting?.(tablesSetting), app, table);
  } catch {
    return false;
  }
}

/** The table a grid shows. In a subgrid the command's primary entity is the parent form's table, so ask the grid itself. */
export function gridTable(control: unknown): string | null {
  try {
    return (control as { getEntityName?: () => string } | null)?.getEntityName?.() ?? null;
  } catch {
    return null;
  }
}

/** Display rule for the grid buttons: separate settings, so bulk replay is switched on on its own. */
export async function isGridAvailable(control: unknown): Promise<boolean> {
  return allowed(GRID_APPS_SETTING, GRID_TABLES_SETTING, gridTable(control));
}
