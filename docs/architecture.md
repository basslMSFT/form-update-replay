# Architecture

## Purpose
Form Update Replay records the column changes a user makes on a model-driven form and replays them on other records. It works on any table, any form and any model-driven app, and does not depend on the Customer Service macro feature.

## Components
| Component | Location | Status |
|---|---|---|
| Recorder, player, value codec (TypeScript, no Xrm dependency) | `src/web-resources/src` | Done |
| Command library `furep.library.js` (captures the form, opens the side pane, decides where the button shows) | `src/web-resources/src/library.ts`, `visibility.ts` | Done |
| Hub UI `furep.hub.html` + `furep.hub.js` (React + Fluent UI v9, pane and dialog modes) | `src/web-resources/src/ui` | Done |
| Replay button: classic ribbon button with a privilege rule and an app/table rule | `src/solution/Other/RibbonCustomization.xml` | Done |
| Settings `bassllab_FormUpdateReplay_Apps` and `_Tables` (form button) and `_GridApps` and `_GridTables` (grid button) | `src/solution/settingdefinitions` | Done |
| Grid button: classic ribbon buttons on subgrids and main grids, sharing one command with a selection rule | `src/solution/Other/RibbonCustomization.xml` | Done |
| Bulk replay engine: table metadata, a virtual form per record so the form planner runs unchanged, Web API writes, undo, CSV (no Xrm dependency) | `src/web-resources/src/bulk.ts`, `bulk-meta.ts` | Done |
| Bulk dialog (React + Fluent UI v9, `mode=bulk`) | `src/web-resources/src/ui/BulkDialog.tsx` | Done |
| Tables and relationship | `src/solution/Entities` | Done |
| Roles | `src/solution/Roles` | Done |
| Plugins (C#) | none | Not needed |

## Decisions
| # | Decision |
|---|---|
| 1 | v1 records column changes only. Playback is form-level only, with a preview before applying. |
| 2 | Instructions are stored as ordered child rows (Salesforce-style): a recording table and a step table. |
| 3 | No PCF controls. A PCF control only receives its own bound columns, so it cannot see the whole form. |
| 4 | The Replay button is defined once in the application ribbon (`{!EntityLogicalName}` token), so it exists on every table and every model-driven app. Display rules then hide it unless the user can read the recording table and the current app and table are enabled in the two settings. |
| 5 | Tables are user- or team-owned (cannot be changed later). Recordings are private by default and can be shared, assigned to a team, or managed by admins. |
| 6 | Security roles ship with the solution: a User role and an Admin role. |
| 7 | The UI follows the Fluent look and feel of the Copilot Service admin center quality screens. |
| 8 | UI languages: Dutch and English, chosen from the user's language setting. |
| 9 | Publisher Bassl Labs, prefix `bassllab_`. License: MIT. Versions 1.x and 2.x were published as MsftNL with the prefix `msftnl_`; 3.0.0 renamed every component, gave the forms, views and roles new IDs and the choice columns a new option value prefix. Because a solution cannot change publisher and tables cannot be renamed, 3.0.0 is a new solution that cannot be imported over the old one: Dataverse refuses it with "The publisher name cannot be changed from 'MSFTNL' to 'bassllab'". |
| 10 | Computed values use a structured *Calculate* step (JSON in `bassllab_calculation`, evaluated by the pure functions in `calc.ts`) instead of Power Fx: there is no supported way to run Power Fx from a web resource, and a structured step needs no extra runtime or package, validates in the editor and previews safely. |
| 11 | Where Replay is shown is configured with two solution settings (apps and tables) set as environment values, and the roles; it is off until an administrator sets the apps. Per-app values are not supported because they could not be written through the API in testing. See [configuration.md](configuration.md). |
| 12 | The button is a classic ribbon button, not a modern command. A modern command can only be gated by Power Fx, which is not available for a command that is not bound to one app and table, and the platform refuses custom rules on modern commands outside Microsoft first-party solutions. |
| 13 | Replay on selected records is a separate button with separate settings (default off), because it writes many records at once. It writes through the Web API, not through a form, so there are no form scripts or business rules; server-side logic still runs. Each record is read once and planned with the same planner as a form: a record is wrapped in a virtual form built from table metadata, so every skip reason, copy rule, calculation and value check behaves the same. |
| 14 | A bulk run is limited to 250 records (the largest grid page), five at a time. Writes carry `If-Match` with the ETag read for the preview, so a record changed by someone else since then is skipped and reported, and `PATCH` can never create a record that was deleted meanwhile. Undo restores only columns that still hold the value the run wrote. The last run is kept in memory on the top window, so Undo lasts until the page is reloaded; the CSV is the lasting record. |

## How the pieces fit

1. The command passes the form context to `FormUpdateReplay.openPanel`, which remembers it in a registry on the top window (keyed by session, table and record) and opens the side pane.
2. The pane (`mode=pane`) follows whatever form is active, using the registry first and the page context as a fallback. Recorders live in the same registry, so each session and record records independently.
3. Recordings are stored through the Web API (deep insert of steps). The tab a recording appears on is derived from its owner and from sharing rows.
4. Replay builds a plan first (what would change, what is skipped and why), the user can answer prompts, and only then are values set on the open form.
5. In a grid, the command passes the grid control and the selected ids to `FormUpdateReplay.openBulk`, which checks the selection (1 to 250 rows), stores the ids in the registry under a one-time token (a long selection would not fit in a query string) and opens the bulk dialog (`mode=bulk`). The dialog reads the recording, loads the table metadata and the records, plans every record, shows the summary and, after confirmation, writes the changes. When it closes, the grid is refreshed.

## Findings that shaped the design

- A classic ribbon change can be defined once for all tables (`{!EntityLogicalName}`), is stored in the solution as the application ribbon (root component type 50, body in `Other/RibbonCustomization.xml`), and can hide a button with display rules: an `EntityPrivilegeRule` for the role check and a JavaScript `CustomRule` for app and table. The JavaScript rule may be asynchronous (it returns a promise) and the platform waits for it. This was verified in the Copilot Service workspace and the Customer Service Hub: the button showed only in the enabled app on the enabled table. Rules that only enable or disable a button grey it out or hide it depending on where it sits, so display rules are used.
- A setting's value for an app can be read in the browser with `getCurrentAppSetting`, and the platform lets an app value override an environment value (seen on an existing Microsoft setting). Creating an app value did not work in the tested environment: `SaveSettingValue` with an app name reported success but stored nothing, and inserting an `appsetting` row failed with a database constraint error. Environment values worked through `SaveSettingValue` without an app name. The solution therefore uses environment values only. The settings screen in the maker portal was opened and shows the environment value written through the API; saving a value on it has not been tried.
- A text setting needs a non-empty default, so "off" is the value `none`.
- Importing the ribbon republishes the command bar of every table (about 6 minutes in the test environment). A second solution import is refused while another is running.
- The older global command (`appaction`, context *All*, location *Form*) works in managed solutions and in every app, but it could not be gated: Power Fx visibility is not available for it, and custom rules are refused ("App Action rules should define only under Microsoft First party Solutions"). Versions 1.x and 2.x kept it hidden so an upgrade could not leave an ungated second button; 3.0.0 does not contain it.
- Copilot Service workspace keeps one form in the DOM at a time, but form contexts of other sessions stay alive; handlers keep working after switching sessions.
- The side pane belongs to the app, not to a session. A collapsed pane never loads its content, so the command expands it before selecting it.
- Records in the workspace autosave. Applying a recording to an open record therefore saves it shortly afterwards; the preview step exists for that reason.
- Lookup values on forms often have no display name; the name is looked up when the recording is stopped.

- A classic grid button works in both apps and in subgrids and main grids. The command receives the grid control (`SelectedControl`) and the selected ids (`SelectedControlSelectedItemIds`), and the app name and settings are available as on a form. In a subgrid `PrimaryEntityTypeName` is the table of the parent form, not of the grid, so the display rule asks the grid control for its table (`getEntityName()`), which also lets one setting list the tables whose grids may show the button. A button without a selection rule disappears as soon as rows are selected, so the command has an enable rule (`SelectionCountRule`, at least one row). Both buttons sit in the `Management` group of `MainTab` for `Mscrm.SubGrid` and `Mscrm.HomepageGrid`; they usually end up under the "..." menu.
- The engine was tested against Dataverse: read and write of text, memo, whole number, yes/no, choice and date-only columns, lookups (single-target and polymorphic, set and clear), calculation and question steps, a conflict created between preview and update (a genuine 412), and undo. Currency, multi-select choice, float, decimal and date-and-time columns are covered by unit tests against a fake API only. Clearing a lookup is a `DELETE` on the relationship reference; setting one is an `@odata.bind` with the navigation property for that target table, which metadata gives per attribute and target. Server-side logic can also change other data as a result of a write: setting an account's primary contact made the platform set that contact's company, and Undo does not revert such side effects.
- Calculations are evaluated in the user's browser time zone. A working-day step moves by calendar day, so the time of day survives a daylight saving change, and weekends are skipped without holiday calendars.
- A Calculate step stores only the calculation (no value). Replaying it reads other columns from the open form, so a column the target form does not have is reported as a reason instead of guessed.

## Known limitations

- On a form, replay is form-level only: no background updates. The grid button updates the selected records (up to 250 per run) but runs no form scripts or business rules.
- No audit of who replayed what; enable Dataverse auditing on the target tables if you need it.
- Field-level security cannot be detected before replay beyond what the form reports as read-only.
- A recording stores the values as they were typed, readable by everyone it is shared with, also when a column is protected by field-level security for them. Do not share recordings of secured or personal columns; use **Ask when replaying** instead, which stores no value.

## Supportability and security notes

- **Documented APIs only.** Client API: `Xrm.App.sidePanes`, `Xrm.Navigation.navigateTo`, `Xrm.Utility` (`getGlobalContext`, `lookupObjects`, `getEntityMetadata`), form context attributes and controls, and `Microsoft.Apm.getFocusedSession` (Copilot Service workspace). Data access: Dataverse Web API v9.2 (tables, `GrantAccess`, `RevokeAccess`, metadata queries) with the signed-in user's rights. The command is a classic ribbon button defined once for all tables; where it shows is decided by display rules and two settings, see decisions 4, 11 and 12.
- **Known deviations.** The form context is shared between the command and the side pane through a registry on the top window, which is not a documented pattern but the only way for a pane to reach the form of the command that opened it. Which record is on screen comes from the documented `Xrm.Utility.getPageContext`, together with the focused session from `Microsoft.Apm.getFocusedSession`. The deprecated `Xrm.Page` is used only when it still exists, so the pane can follow the user to a record where the command was not used yet; it is feature-detected and nothing depends on it. When it is gone, the pane shows "Select Replay in the command bar on this record to use it here" instead of a form. If a future release breaks the registry, only `registry.ts` and `controller.ts` need to change. The button's visibility rule uses `Xrm.Utility.getGlobalContext().getCurrentAppProperties` and `getCurrentAppSetting`, both documented; when either fails the button is hidden, not shown.
- **Security model.** No plug-ins, no elevated calls, no external services and no stored credentials. Everything runs as the signed-in user, so field-level security, read-only fields and table privileges still apply when a recording is replayed. The roles in the package grant privileges on the two recording tables only. When a solution with custom roles is imported, the platform adds four default SharePoint privileges (create, read and write SharePoint data, read SharePoint document) to each role; they cannot be left out of the package.
- **Untrusted recordings.** A recording that someone shared can contain any column names and values. They are shown as text (never as HTML), the table name is validated before it is used in a request, the preview shows every change first, and nothing is saved until the user saves the form.
- **Dependencies.** The shipped web resources contain React and Fluent UI (MIT) and make no calls outside the Dataverse organization. Run `npm audit --omit=dev` before each release.
