# Form Update Replay

Record the column changes you make on a Dynamics 365 form and replay them on other records. Works on any table and form of any model-driven app, including the multi-session Copilot Service workspace, once an administrator turns it on for the apps and tables they want (see [Turn it on](#turn-it-on)). Dutch and English, chosen automatically from the user's language.

## How it works

1. Open a record and click **Replay** in the command bar (use the "..." menu if it is not visible). The button is shown only to people who have one of the Form Update Replay roles, and only in the apps and on the tables an administrator enabled. A side pane opens.
2. Click **Start recording**, change columns on the form, then click **Stop recording**.
3. Review the changes. For each change choose where the value comes from: the **fixed value** you recorded, **ask when replaying** (you pick or type a value that fits the column, for example a choice list for an option set or a record picker for a lookup), **copy from column** (only columns of a compatible type are offered), or **calculate** (see below). Give the recording a name and save it.
4. On another record of the same table, open the pane, choose the recording and click **Preview**. You see what will change and why anything is skipped. **Apply to form** sets the values on the open form; you save the form yourself.
5. **Manage recordings** opens a dialog with *My recordings*, *Shared by me*, *Shared with me*, *Team recordings* and (for admins) *All recordings*. The grid shows whether a recording is shared and with how many people or teams, for example *Yes (3)*. Open a recording to change the order of its changes, edit them, see who it is shared with and stop sharing. Select one or more rows with the round control to enable the actions: open and rename need exactly one row; share, assign to a team and delete work on several.

Recordings are private to their owner until you share them or assign them to a team.

## Replay on selected records

Select records in a list or in a subgrid and click **Replay** in the command bar (use the "..." menu if it is not visible). The button is enabled once at least one row is selected and, like the form button, is shown only in the apps and on the tables an administrator enabled for grids (see [Turn it on](#turn-it-on)).

1. Choose a recording for the table of the grid and click **Preview**. The records are read, and any question the recording asks is shown once for all records.
2. The preview shows how many records will change, per column how many will change, are already correct or are skipped and why, and the first records one by one.
3. Confirm. The records are updated five at a time, up to **250 per run**. A progress bar shows how far it is and **Stop** ends the run after the records already under way. A record that someone else changed after the preview is skipped and reported, never overwritten. A record that fails (for example, a closed case or a record you cannot edit) is reported and does not stop the others.
4. When it is done you see a result per record. **Download CSV** saves one row per record and column with the old value, the new value and the result. **Undo this run** puts the old values back, but only for columns that still hold the value the run wrote, so a later edit by someone else is never overwritten. The undo is kept until the page is reloaded, so download the CSV if you need a lasting record.

What is different from a form:

- There is no form, so **form scripts and business rules do not run**. Server-side logic, such as plug-ins and flows, still does, and so does auditing. The dialog says so before you confirm.
- Whether a column can be changed is decided by the table's metadata and your security roles, not by what a form shows. A column that is read-only for you is skipped; a column that is merely hidden on a form is not.
- Changes made by server-side logic as a result of the update are not undone. For example, when a recording sets the primary contact of an account, Dynamics also sets that contact's company, and Undo restores the primary contact but not that side effect.

Recordings are the same ones the form uses; a calculation or a copy reads the values of each selected record. Screenshots 22 to 28 below show Replay on selected records.

## Calculate

Choose **Calculate** as the value source to work out the value when the recording is replayed, from the form it is replayed on. No formula language: you pick the options.

| Column type | What you can do |
|---|---|
| Date and time, date only | Start from today or now, the current value of the column, another column on the form, or a fixed date. Add or subtract days, weeks, months, years or **working days (Mon-Fri)**. Months are clamped to the end of a shorter month (31 January + 1 month = 28 or 29 February). |
| Text, multi-line text | **Add after**, **add before** or **replace** the current text, with no separator, a space or a new line. Placeholders: `{{today}}`, `{{now}}`, `{{user}}` and `{{column_name}}` for any other column on the form. |
| Whole number, decimal, float, currency | Add, subtract, multiply or add a percentage, with a fixed number or another column. Whole-number columns are rounded; decimal and currency columns are rounded to their precision. |

A calculation sees what earlier steps of the same replay set, so a later step can build on an earlier one. The preview shows the calculated value, and a step is skipped with a reason when a column it needs is missing, empty or of the wrong type. Working days count Monday to Friday only; public holidays are not taken into account. Screenshots 10 to 15 below show Calculate.

## Screenshots

A narrated walkthrough (3.5 minutes, including Calculate) is in [docs/media/form-update-replay-demo.mp4](docs/media/form-update-replay-demo.mp4). It was recorded before Replay on selected records existed, so that part is shown in screenshots 22 to 28 only. The screenshots use dummy data.

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
| ![Dutch user interface](docs/images/21-dutch.png) **21. Dutch interface** | ![The Replay command in a list](docs/images/22-grid-replay-button.png) **22. Replay in a list, with three cases selected** |
| ![Preview of a grid replay, with a question](docs/images/23-grid-preview-question.png) **23. Grid preview: the question is asked once** | ![Preview with the question answered](docs/images/24-grid-preview-answered.png) **24. Grid preview: answered** |
| ![Confirmation before updating](docs/images/25-grid-confirm.png) **25. Confirm before updating** | ![Result per record, with Download CSV and Undo](docs/images/26-grid-result.png) **26. Result per record, CSV and Undo** |
| ![The list after the run](docs/images/27-grid-after-run.png) **27. The list after the run** | ![Replay in a subgrid](docs/images/28-subgrid-replay-button.png) **28. Replay in a subgrid** |

## Install

1. Download the latest managed solution zip from the [Releases](../../releases) page.
2. Go to [make.powerapps.com](https://make.powerapps.com), pick your environment, open **Solutions** and choose **Import solution**.
3. Upload the zip, finish the wizard, then choose **Publish all customizations**. This takes several minutes, because the Replay button is added to the command bar of every table.
4. **Turn it on** (below) and assign the security roles. Until you do, nobody sees the Replay button.
5. Hard-reload the app (Ctrl+F5).

Or with the Power Platform CLI:

```bash
pac auth create --url https://YOUR_ORG.crm.dynamics.com
pac solution import --path FormUpdateReplay_managed.zip --publish-changes
```

### Turn it on

Replay is **off everywhere after installation**. Four settings decide where the buttons appear: two for the form button and two for the grid button. All are lists of names, separated by commas, and are set once for the whole environment (see [docs/configuration.md](docs/configuration.md) for how, and for why per-app values are not supported).

| Setting | Default | Meaning |
|---------|---------|---------|
| `msftnl_FormUpdateReplay_Apps` | `none` | Unique names of the model-driven apps that show Replay on forms, for example `msdyn_CustomerServiceWorkspace,Customerservicehub`. `*` means every app. |
| `msftnl_FormUpdateReplay_Tables` | `*` | Logical names of the tables that show Replay on forms, for example `incident,account`. `*` means every table. A minus excludes a table: `*,-lead`. |
| `msftnl_FormUpdateReplay_GridApps` | `none` | The same for the Replay button in lists and subgrids, which updates the selected records. Kept separate because it changes many records at once. |
| `msftnl_FormUpdateReplay_GridTables` | `*` | The same for the tables whose lists and subgrids show it. |

A button appears only when **both** lists of its pair allow the current app and table, **and** the user has one of the roles below. See [docs/configuration.md](docs/configuration.md) for examples and for how to find an app's unique name.

> Showing or hiding the button is a convenience, not a security boundary. What people can read and change is always decided by their Dataverse security roles.

### Upgrading from 1.0.x

Version 1.0.x added the Replay button to every app. After the upgrade the old button is hidden and the new one follows the settings above, so **Replay disappears until you set `msftnl_FormUpdateReplay_Apps`**. Existing recordings are not touched.

### Upgrading from 2.0.x

Nothing changes for the form button. The new grid button stays hidden until you set `msftnl_FormUpdateReplay_GridApps`. The upgrade republishes the command bars (several minutes).

### Security roles

The solution adds two roles. Assign them next to the role people already have; they only cover the recording tables.

| Role | Gives |
|------|-------|
| Form Update Replay User | Create, read, edit, delete, assign and share own recordings, and use recordings shared with them or their teams. Shows the Replay button. |
| Form Update Replay Admin | The same rights across the whole organization, and the *All recordings* tab. Shows the Replay button. |

The Replay button is shown to everyone who can read recordings, which in practice means everyone with one of these roles. A custom role works too when it grants read access to the *Update Recording* table.

Replaying never grants more access than the user already has. On a form, values are set on the open form, so read-only and secured columns are skipped and the normal save rules apply; columns that are hidden on the form (hidden field, section or tab) or not on it at all count as not available: they are skipped as target, as copy source and as input of a calculation. In a grid, each record is updated as the signed-in user through the Web API, so a column or record the user cannot change is skipped or reported and Dataverse enforces the security roles on every write.

## What is stored

Each recording is a row in `msftnl_updaterecording` with one child row per change in `msftnl_updaterecordingstep` (column, type, value, how the value is obtained). Everything stays in your Dataverse environment. Nothing is sent anywhere else. Recorded values are visible to everyone the recording is shared with, so use **Ask when replaying** for personal or sensitive values.

## Supported columns

Text, multi-line text, whole number, decimal, float, currency, yes/no, date and time, date only, choice, choices and lookup. Other column types (images, files, calculated and so on) are ignored while recording.

## Limitations

- On a form, Replay sets values on the open form only; you save it yourself. The grid button is the only part that changes records directly, and then only the selected ones (up to 250 per run, the rows currently loaded in the grid).
- Many apps, including the Copilot Service workspace, autosave. Applied values are then saved shortly after you apply them, so look at the preview first.
- Lookups are replayed by record, so the target record must exist in the environment.
- A recording only applies to forms of the table it was recorded on.
- The Replay buttons are classic command-bar buttons defined in the solution's ribbon XML. That is the variant I found that can be hidden by role, app and table from a solution; the modern command designer cannot do this for a command that is not tied to one app and table. They cannot be edited in the command designer. Installing or upgrading republishes the ribbon of every table, which takes several minutes.
- The form button appears on main forms only, not in quick create forms. The grid button appears in main grids and subgrids; if it is not visible, look under the "..." menu.
- The side pane learns which record is on screen from the documented `Xrm.Utility.getPageContext` and gets the form from the Replay command. On a record where Replay was not used yet, the pane follows you only while the deprecated `Xrm.Page` still exists; once Microsoft removes it, the pane asks you to select Replay on that record. Nothing else breaks. See [docs/architecture.md](docs/architecture.md).

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
