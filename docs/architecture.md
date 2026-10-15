# Architecture

## Purpose
Form Update Replay records the column changes a user makes on a model-driven form and replays them on other records. It works on any table, any form and any model-driven app, and does not depend on the Customer Service macro feature.

## Components
| Component | Location | Status |
|---|---|---|
| Recorder, player, value codec (TypeScript, no Xrm dependency) | `src/web-resources/src` | Done |
| Command library `furep.library.js` (captures the form, opens the side pane) | `src/web-resources/src/library.ts` | Done |
| Hub UI `furep.hub.html` + `furep.hub.js` (React + Fluent UI v9, pane and dialog modes) | `src/web-resources/src/ui` | Done |
| Global command `msftnl_FormUpdateReplay.Form.Open` | `src/solution/appactions` | Done |
| Tables and relationship | `src/solution/Entities` | Done |
| Roles | `src/solution/Roles` | Done |
| Plugins (C#) | none | Not needed |

## Decisions
| # | Decision |
|---|---|
| 1 | v1 records column changes only. Playback is form-level only, with a preview before applying. |
| 2 | Instructions are stored as ordered child rows (Salesforce-style): a recording table and a step table. |
| 3 | No PCF controls. A PCF control only receives its own bound columns, so it cannot see the whole form. |
| 4 | A global-scope command on the main form location makes the feature available on every table and every model-driven app. |
| 5 | Tables are user- or team-owned (cannot be changed later). Recordings are private by default and can be shared, assigned to a team, or managed by admins. |
| 6 | Security roles ship with the solution: a User role and an Admin role. |
| 7 | The UI follows the Fluent look and feel of the Copilot Service admin center quality screens. |
| 8 | UI languages: Dutch and English, chosen from the user's language setting. |
| 9 | Publisher prefix `msftnl_`. License: MIT. |

## How the pieces fit

1. The command passes the form context to `FormUpdateReplay.openPanel`, which remembers it in a registry on the top window (keyed by session, table and record) and opens the side pane.
2. The pane (`mode=pane`) follows whatever form is active, using the registry first and the page context as a fallback. Recorders live in the same registry, so each session and record records independently.
3. Recordings are stored through the Web API (deep insert of steps). The tab a recording appears on is derived from its owner and from sharing rows.
4. Replay builds a plan first (what would change, what is skipped and why), the user can answer prompts, and only then are values set on the open form.

## Findings that shaped the design

- A global command is an `appaction` with context *All*, location *Form* and no app. It works in managed solutions and in every app. It can take a few minutes after publishing before the first reload shows it.
- Copilot Service workspace keeps one form in the DOM at a time, but form contexts of other sessions stay alive; handlers keep working after switching sessions.
- The side pane belongs to the app, not to a session. A collapsed pane never loads its content, so the command expands it before selecting it.
- Records in the workspace autosave. Applying a recording to an open record therefore saves it shortly afterwards; the preview step exists for that reason.
- Lookup values on forms often have no display name; the name is looked up when the recording is stopped.

## Known limitations

- Only form-level replay (no background updates of many records).
- No audit of who replayed what; enable Dataverse auditing on the target tables if you need it.
- Field-level security cannot be detected before replay beyond what the form reports as read-only.
