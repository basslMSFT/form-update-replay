# Form Update Replay

Record the column changes you make on a Dynamics 365 form and replay them on other records. Works on every table, every form and every model-driven app, including the multi-session Copilot Service workspace. Dutch and English, chosen automatically from the user's language.

## How it works

1. Open a record and click **Replay** in the command bar (use the "..." menu if it is not visible). A side pane opens.
2. Click **Start recording**, change columns on the form, then click **Stop recording**.
3. Review the changes. For each change choose where the value comes from: the **fixed value** you recorded, **ask when replaying** (you pick or type a value that fits the column, for example a choice list for an option set or a record picker for a lookup), **copy from column** (only columns of a compatible type are offered), or **calculate** (see below). Give the recording a name and save it.
4. On another record of the same table, open the pane, choose the recording and click **Preview**. You see what will change and why anything is skipped. **Apply to form** sets the values on the open form; you save the form yourself.
5. **Manage recordings** opens a dialog with *My recordings*, *Shared by me*, *Shared with me*, *Team recordings* and (for admins) *All recordings*. The grid shows whether a recording is shared and with how many people or teams, for example *Yes (3)*. Open a recording to change the order of its changes, edit them, see who it is shared with and stop sharing. Select one or more rows with the round control to enable the actions: open and rename need exactly one row; share, assign to a team and delete work on several.

Recordings are private to their owner until you share them or assign them to a team.

## Calculate

Choose **Calculate** as the value source to work out the value when the recording is replayed, from the form it is replayed on. No formula language: you pick the options.

| Column type | What you can do |
|---|---|
| Date and time, date only | Start from today or now, the current value of the column, another column on the form, or a fixed date. Add or subtract days, weeks, months, years or **working days (Mon-Fri)**. Months are clamped to the end of a shorter month (31 January + 1 month = 28 or 29 February). |
| Text, multi-line text | **Add after**, **add before** or **replace** the current text, with no separator, a space or a new line. Placeholders: `{{today}}`, `{{now}}`, `{{user}}` and `{{column_name}}` for any other column on the form. |
| Whole number, decimal, float, currency | Add, subtract, multiply or add a percentage, with a fixed number or another column. Whole-number columns are rounded; decimal and currency columns are rounded to their precision. |

A calculation sees what earlier steps of the same replay set, so a later step can build on an earlier one. The preview shows the calculated value, and a step is skipped with a reason when a column it needs is missing, empty or of the wrong type. Working days count Monday to Friday only; public holidays are not taken into account. Screenshots 10 to 15 below show Calculate.

## Screenshots

A narrated walkthrough (3.5 minutes, including Calculate) is in [docs/media/form-update-replay-demo.mp4](docs/media/form-update-replay-demo.mp4). The screenshots use dummy data.

| | |
|---|---|
| ![The Replay command in the command bar](docs/images/01-replay-command.png) **1. The Replay command** | ![The side pane next to the form](docs/images/02-side-pane.png) **2. The side pane** |
| ![Recording changes on the form](docs/images/03-recording-changes.png) **3. Recording changes** | ![Reviewing the recorded changes](docs/images/04-review-changes.png) **4. Review the changes** |
| ![Ask when replaying](docs/images/05-ask-when-replaying.png) **5. Ask when replaying** | ![Preview with questions](docs/images/06-preview-questions.png) **6. Preview with questions** |
| ![Questions answered](docs/images/07-preview-answered.png) **7. Typed answers** | ![Applied to the form](docs/images/08-applied-to-form.png) **8. Applied to the form** |
| ![Copy from column](docs/images/09-copy-from-column.png) **9. Copy from column** | ![Calculate dates](docs/images/10-calculate-dates.png) **10. Calculate: dates and working days** |
| ![Calculate text](docs/images/11-calculate-text.png) **11. Calculate: text with placeholders** | ![Calculate numbers](docs/images/12-calculate-numbers.png) **12. Calculate: numbers and percentages** |
| ![Preview of calculated values](docs/images/13-calculate-preview.png) **13. Preview of calculated values** | ![Calculated values applied](docs/images/14-calculate-applied.png) **14. Calculated values applied** |
| ![Numbers preview](docs/images/15-calculate-numbers-preview.png) **15. The same for numbers** | ![Manage recordings](docs/images/16-manage-recordings.png) **16. Manage recordings** |
| ![Selecting several recordings](docs/images/17-multi-select.png) **17. Multi-select actions** | ![Share dialog](docs/images/18-share-dialog.png) **18. Share** |
| ![Shared with a team](docs/images/19-shared-with-team.png) **19. Shared with a team** | ![Recording detail](docs/images/20-recording-detail.png) **20. Recording detail** |
| ![Dutch user interface](docs/images/21-dutch.png) **21. Dutch interface** | |

## Install

1. Download the latest managed solution zip from the [Releases](../../releases) page.
2. Go to [make.powerapps.com](https://make.powerapps.com), pick your environment, open **Solutions** and choose **Import solution**.
3. Upload the zip, finish the wizard, then choose **Publish all customizations**.
4. Hard-reload the app (Ctrl+F5).

Or with the Power Platform CLI:

```bash
pac auth create --url https://YOUR_ORG.crm.dynamics.com
pac solution import --path FormUpdateReplay_managed.zip --publish-changes
```

### Security roles

The solution adds two roles. Assign them next to the role people already have; they only cover the recording tables.

| Role | Gives |
|------|-------|
| Form Update Replay User | Create, read, edit, delete, assign and share own recordings, and use recordings shared with them or their teams. |
| Form Update Replay Admin | The same rights across the whole organization, and the *All recordings* tab. |

Replaying never grants more access than the user already has: values are set on the open form, so read-only and secured columns are skipped and the normal save rules apply. Columns that are hidden on the form (hidden field, section or tab) or not on it at all count as not available: they are skipped as target, as copy source and as input of a calculation.

## What is stored

Each recording is a row in `msftnl_updaterecording` with one child row per change in `msftnl_updaterecordingstep` (column, type, value, how the value is obtained). Everything stays in your Dataverse environment. Nothing is sent anywhere else. Recorded values are visible to everyone the recording is shared with, so use **Ask when replaying** for personal or sensitive values.

## Supported columns

Text, multi-line text, whole number, decimal, float, currency, yes/no, date and time, date only, choice, choices and lookup. Other column types (images, files, calculated and so on) are ignored while recording.

## Limitations

- Replay sets values on the open form only. It does not change records in the background.
- Many apps, including the Copilot Service workspace, autosave. Applied values are then saved shortly after you apply them, so look at the preview first.
- Lookups are replayed by record, so the target record must exist in the environment.
- A recording only applies to forms of the table it was recorded on.
- The side pane reaches the form of the command that opened it through a registry on the top window, and falls back to the deprecated `Xrm.Page`. Both are the only way for a pane to see the active form, but they are not documented patterns and could stop working in a future release of Dynamics 365. See [docs/architecture.md](docs/architecture.md).

## For developers

```bash
cd src/web-resources
npm ci
npm run typecheck
npm test
npm run build            # writes dist/
```

The solution source is unpacked in `src/solution` (`pac solution unpack`). `node scripts/sync-webresources.mjs` copies the built bundles into it, then `pac solution pack` creates the zips. See [docs/architecture.md](docs/architecture.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE). Third-party notices, with the copyright and license texts, are in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) and at the end of the shipped `furep.hub.js`.

## Disclaimer

Form Update Replay is a community project provided as is, without warranty or support commitments. It is not an official Microsoft product. Dynamics 365, Dataverse, Power Apps and Copilot Service workspace are trademarks of Microsoft Corporation; they are used here only to describe what the solution works with. Screenshots use dummy data.
