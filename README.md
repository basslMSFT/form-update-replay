# Form Update Replay

Record the column changes you make on a Dynamics 365 form and replay them on other records. Works on any table and form of any model-driven app, including the multi-session Copilot Service workspace, once an administrator turns it on for the apps and tables they want (see [Turn it on](#turn-it-on)). Dutch and English, chosen automatically from the user's language.

## How it works

1. Open a record and click **Replay** in the command bar (use the "..." menu if it is not visible). The button is shown only to people who have one of the Form Update Replay roles, and only in the apps and on the tables an administrator enabled. A side pane opens.
2. Click **Start recording**, change columns on the form, then click **Stop recording**.
3. Review the changes. For each change choose where the value comes from: the **fixed value** you recorded, **ask when replaying** (you pick or type a value that fits the column, for example a choice list for an option set or a record picker for a lookup), **copy from column** (only columns of a compatible type are offered), or **calculate** (see below). Give the recording a name and save it.
4. On another record of the same table, open the pane, choose the recording and click **Preview**. You see what will change and why anything is skipped. **Apply to form** sets the values on the open form; you save the form yourself.
5. **Manage recordings** opens a dialog with *My recordings*, *Shared by me*, *Shared with me*, *Team recordings* and (for admins) *All recordings*. The grid shows whether a recording is shared and with how many people or teams, for example *Yes (3)*. Open a recording to change the order of its changes, edit them, see who it is shared with and stop sharing. Select one or more rows with the round control to enable the actions: open and rename need exactly one row; share, assign to a team and delete work on several.

Recordings are private to their owner until you share them or assign them to a team. **Share** offers two ways: people and teams by name, or a **business unit** (see [Sharing with a business unit](docs/configuration.md#sharing-with-a-business-unit)).

## Notes and tasks

A recording can also add a **note** or a **task** to the record, for example "Called the customer" or "Follow up in a week".

- **Add them in the review step** (after you stop recording) or later in **Manage recordings**, with the **Add note** and **Add task** buttons under the steps. A note has a subject and text; a task has a subject, a description, a due date (a number of days counted from the day you replay) and a priority.
- **Or just add them while recording.** Notes and tasks you add to the *saved* record in the timeline while recording are picked up when you stop, and shown in the review step so you can edit or remove them. Attachments are not captured.
- The text can use `{{today}}`, `{{now}}`, `{{user}}` and `{{column_name}}` (a column of the record), for example `Reviewed {{today}} by {{user}}: {{title}}`.
- **On a form**, the note or task is created when you click **Apply to form** (the record must be saved) and the timeline is refreshed.
- **On selected records in a grid**, one is created for every record. **Undo this run** deletes exactly the notes and tasks that run created.
- A record that already has the identical note (same subject and text) or the identical *open* task (same subject and description) gets nothing extra, so replaying twice does not duplicate.
- Notes and tasks are created as you, so they need the normal create rights for notes or tasks, and the table must have notes or activities enabled. On a new, unsaved record, or when you lack the right, the step is skipped or reported with the reason.
- Notes and tasks added by steps are plain text. They are stored in the recording as text, so do not put personal data in them; see *What is stored*.

Screenshots 29 to 34, 37 and 39 to 41 below show notes and tasks, and screenshot 36 shows sharing with a business unit.

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

A narrated walkthrough (3.5 minutes, including Calculate) is in [docs/media/form-update-replay-demo.mp4](docs/media/form-update-replay-demo.mp4). It was recorded before Replay on selected records, notes and tasks, and business-unit sharing existed. Those parts are covered by a second, shorter narrated video, [What's new in 3.1](docs/media/form-update-replay-whats-new-3.1.mp4) (2 minutes), and by screenshots 22 to 41. The screenshots and videos use dummy data.

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
| ![Recording with a note added in the timeline](docs/images/29-recording-note-counter.png) **29. A note added while recording is counted** | ![Review step with Save and Discard at the top](docs/images/30-review-save-discard.png) **30. Review: Save and Discard stay at the top** |
| ![Note step](docs/images/31-add-note-editor.png) **31. A note step** | ![Task step](docs/images/32-add-task-editor.png) **32. A task step** |
| ![Preview with a note and a task](docs/images/33-preview-note-task.png) **33. Preview with a note and a task** | ![Timeline after Apply](docs/images/34-timeline-after-apply.png) **34. The timeline after Apply** |
| ![Recording detail in two columns](docs/images/35-manage-detail-share-panel.png) **35. Recording detail: steps left, sharing right** | ![Share with a business unit](docs/images/36-share-business-unit.png) **36. Share with a business unit** |
| ![Notes and tasks on an unsaved case](docs/images/37-new-case-save-first-error.png) **37. Unsaved record: save it first** | ![Version at the bottom of the pane](docs/images/38-version-label.png) **38. The version at the bottom of the pane** |
| ![Grid preview with notes and tasks](docs/images/39-grid-preview-notes-tasks.png) **39. Grid preview with notes and tasks** | ![Grid result](docs/images/40-grid-result.png) **40. Grid result** |
| ![Undo result](docs/images/41-undo-result.png) **41. Undo removes what the run created** | |

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
| `bassllab_FormUpdateReplay_Apps` | `none` | Unique names of the model-driven apps that show Replay on forms, for example `msdyn_CustomerServiceWorkspace,Customerservicehub`. `*` means every app. |
| `bassllab_FormUpdateReplay_Tables` | `*` | Logical names of the tables that show Replay on forms, for example `incident,account`. `*` means every table. A minus excludes a table: `*,-lead`. |
| `bassllab_FormUpdateReplay_GridApps` | `none` | The same for the Replay button in lists and subgrids, which updates the selected records. Kept separate because it changes many records at once. |
| `bassllab_FormUpdateReplay_GridTables` | `*` | The same for the tables whose lists and subgrids show it. |

A button appears only when **both** lists of its pair allow the current app and table, **and** the user has one of the roles below. See [docs/configuration.md](docs/configuration.md) for examples and for how to find an app's unique name.

> Showing or hiding the button is a convenience, not a security boundary. What people can read and change is always decided by their Dataverse security roles.

### Moving from 1.x or 2.x

**3.0.0 is a new solution under a new publisher (Bassl Labs, prefix `bassllab_`) and cannot be imported over 1.x or 2.x.** Remove the old solution first, install 3.0.0 and set the four settings again. Recordings are not carried over. The steps are in [docs/installation.md](docs/installation.md#moving-from-1x-or-2x-to-30).

### Security roles

The solution adds two roles. Assign them next to the role people already have; they only cover the recording tables.

| Role | Gives |
|------|-------|
| Form Update Replay User | Create, read, edit, delete, assign and share own recordings, and use recordings shared with them or their teams. Shows the Replay button. |
| Form Update Replay Admin | The same rights across the whole organization, and the *All recordings* tab. Shows the Replay button. |

The Replay button is shown to everyone who can read recordings, which in practice means everyone with one of these roles. A custom role works too when it grants read access to the *Update Recording* table.

Replaying never grants more access than the user already has. On a form, values are set on the open form, so read-only and secured columns are skipped and the normal save rules apply; columns that are hidden on the form (hidden field, section or tab) or not on it at all count as not available: they are skipped as target, as copy source and as input of a calculation. In a grid, each record is updated as the signed-in user through the Web API, so a column or record the user cannot change is skipped or reported and Dataverse enforces the security roles on every write.

## What is stored

Each recording is a row in `bassllab_updaterecording` with one child row per change in `bassllab_updaterecordingstep` (column, type, value, how the value is obtained). A note or task step stores its subject, text, due offset and priority as JSON in the same value column. Everything stays in your Dataverse environment. Nothing is sent anywhere else. Recorded values are visible to everyone the recording is shared with, so use **Ask when replaying** for personal or sensitive values.

## Supported columns

Text, multi-line text, whole number, decimal, float, currency, yes/no, date and time, date only, choice, choices and lookup. Other column types (images, files and so on) are ignored while recording.

Columns that Dataverse fills in itself are left out as well, because they can never be replayed: the address composite ("Address 1"), a contact's full name, created and modified dates, and calculated, rollup and formula columns. Editing an address line makes the platform update the composite column too; Replay records only the line you edited and tells you what it left out. The columns are looked up in the table's metadata when the pane opens, and if that lookup fails recording works as before.

Columns that a **business rule or a script** sets for you are different: they look like ordinary changes and are recorded. Replaying fires the same rules again, so those steps are usually redundant, and they can be wrong when the rule would give another answer on the record you replay on. Remove them in the review step. See [docs/architecture.md](docs/architecture.md).

## Limitations

- On a form, Replay sets column values on the open form only; you save it yourself. Notes and tasks are the exception: they are created as soon as you click **Apply to form**. The grid button is the only part that changes records directly, and then only the selected ones (up to 250 per run, the rows currently loaded in the grid).
- Many apps, including the Copilot Service workspace, autosave. Applied values are then saved shortly after you apply them, so look at the preview first.
- Lookups are replayed by record, so the target record must exist in the environment.
- Notes and tasks can only be added to a saved record, and only plain text (no attachments, no rich text). A task is created open and assigned to whoever replays; recurring or assigned-to-someone-else tasks are not supported.
- Sharing with a business unit is a one-time snapshot (see [docs/configuration.md](docs/configuration.md#sharing-with-a-business-unit)).
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
