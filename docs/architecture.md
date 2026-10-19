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
| Settings `msftnl_FormUpdateReplay_Apps` and `_Tables` | `src/solution/settingdefinitions` | Done |
| Old global command `msftnl_FormUpdateReplay.Form.Open` (kept hidden so upgrades cannot show two buttons) | `src/solution/appactions` | Deprecated |
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
| 9 | Publisher prefix `msftnl_`. License: MIT. |
| 10 | Computed values use a structured *Calculate* step (JSON in `msftnl_calculation`, evaluated by the pure functions in `calc.ts`) instead of Power Fx: there is no supported way to run Power Fx from a web resource, and a structured step needs no extra runtime or package, validates in the editor and previews safely. |
| 11 | Where Replay is shown is configured with two solution settings (apps and tables) set as environment values, and the roles; it is off until an administrator sets the apps. Per-app values are not supported because they could not be written through the API in testing. See [configuration.md](configuration.md). |
| 12 | The button is a classic ribbon button, not a modern command. A modern command can only be gated by Power Fx, which is not available for a command that is not bound to one app and table, and the platform refuses custom rules on modern commands outside Microsoft first-party solutions. |

## How the pieces fit

1. The command passes the form context to `FormUpdateReplay.openPanel`, which remembers it in a registry on the top window (keyed by session, table and record) and opens the side pane.
2. The pane (`mode=pane`) follows whatever form is active, using the registry first and the page context as a fallback. Recorders live in the same registry, so each session and record records independently.
3. Recordings are stored through the Web API (deep insert of steps). The tab a recording appears on is derived from its owner and from sharing rows.
4. Replay builds a plan first (what would change, what is skipped and why), the user can answer prompts, and only then are values set on the open form.

## Findings that shaped the design

- A classic ribbon change can be defined once for all tables (`{!EntityLogicalName}`), is stored in the solution as the application ribbon (root component type 50, body in `Other/RibbonCustomization.xml`), and can hide a button with display rules: an `EntityPrivilegeRule` for the role check and a JavaScript `CustomRule` for app and table. The JavaScript rule may be asynchronous (it returns a promise) and the platform waits for it. This was verified in the Copilot Service workspace and the Customer Service Hub: the button showed only in the enabled app on the enabled table. Rules that only enable or disable a button grey it out or hide it depending on where it sits, so display rules are used.
- A setting's value for an app can be read in the browser with `getCurrentAppSetting`, and the platform lets an app value override an environment value (seen on an existing Microsoft setting). Creating an app value did not work in the tested environment: `SaveSettingValue` with an app name reported success but stored nothing, and inserting an `appsetting` row failed with a database constraint error. Environment values worked through `SaveSettingValue` without an app name. The solution therefore uses environment values only. The settings screen in the maker portal was opened and shows the environment value written through the API; saving a value on it has not been tried.
- A text setting needs a non-empty default, so "off" is the value `none`.
- Importing the ribbon republishes the command bar of every table (about 6 minutes in the test environment). A second solution import is refused while another is running.
- The older global command (`appaction`, context *All*, location *Form*) still works in managed solutions and in every app. It could not be gated: Power Fx visibility is not available for it, and custom rules are refused ("App Action rules should define only under Microsoft First party Solutions"). The package keeps it with `hidden = 1` so an upgrade cannot leave an ungated second button.
- Copilot Service workspace keeps one form in the DOM at a time, but form contexts of other sessions stay alive; handlers keep working after switching sessions.
- The side pane belongs to the app, not to a session. A collapsed pane never loads its content, so the command expands it before selecting it.
- Records in the workspace autosave. Applying a recording to an open record therefore saves it shortly afterwards; the preview step exists for that reason.
- Lookup values on forms often have no display name; the name is looked up when the recording is stopped.

- Calculations are evaluated in the user's browser time zone. A working-day step moves by calendar day, so the time of day survives a daylight saving change, and weekends are skipped without holiday calendars.
- A Calculate step stores only the calculation (no value). Replaying it reads other columns from the open form, so a column the target form does not have is reported as a reason instead of guessed.

## Known limitations

- Only form-level replay (no background updates of many records).
- No audit of who replayed what; enable Dataverse auditing on the target tables if you need it.
- Field-level security cannot be detected before replay beyond what the form reports as read-only.
- A recording stores the values as they were typed, readable by everyone it is shared with, also when a column is protected by field-level security for them. Do not share recordings of secured or personal columns; use **Ask when replaying** instead, which stores no value.

## Supportability and security notes

- **Documented APIs only.** Client API: `Xrm.App.sidePanes`, `Xrm.Navigation.navigateTo`, `Xrm.Utility` (`getGlobalContext`, `lookupObjects`, `getEntityMetadata`), form context attributes and controls, and `Microsoft.Apm.getFocusedSession` (Copilot Service workspace). Data access: Dataverse Web API v9.2 (tables, `GrantAccess`, `RevokeAccess`, metadata queries) with the signed-in user's rights. The command is a classic ribbon button defined once for all tables; where it shows is decided by display rules and two settings, see decisions 4, 11 and 12.
- **Known deviations.** The form context is shared between the command and the side pane through a registry on the top window, which is not a documented pattern but the only way for a pane to reach the form of the command that opened it. Which record is on screen comes from the documented `Xrm.Utility.getPageContext`, together with the focused session from `Microsoft.Apm.getFocusedSession`. The deprecated `Xrm.Page` is used only when it still exists, so the pane can follow the user to a record where the command was not used yet; it is feature-detected and nothing depends on it. When it is gone, the pane shows "Select Replay in the command bar on this record to use it here" instead of a form. If a future release breaks the registry, only `registry.ts` and `controller.ts` need to change. The button's visibility rule uses `Xrm.Utility.getGlobalContext().getCurrentAppProperties` and `getCurrentAppSetting`, both documented; when either fails the button is hidden, not shown.
- **Security model.** No plug-ins, no elevated calls, no external services and no stored credentials. Everything runs as the signed-in user, so field-level security, read-only fields and table privileges still apply when a recording is replayed. The roles in the package grant privileges on the two recording tables only. When a solution with custom roles is imported, the platform adds four default SharePoint privileges (create, read and write SharePoint data, read SharePoint document) to each role; they cannot be left out of the package.
- **Untrusted recordings.** A recording that someone shared can contain any column names and values. They are shown as text (never as HTML), the table name is validated before it is used in a request, the preview shows every change first, and nothing is saved until the user saves the form.
- **Dependencies.** The shipped web resources contain React and Fluent UI (MIT) and make no calls outside the Dataverse organization. Run `npm audit --omit=dev` before each release.
