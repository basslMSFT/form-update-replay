# Changelog

All notable changes to this solution will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [3.1.1] - 2026-10-22

### Changed
- The Save recording and Discard buttons at the top of the review step have some room on the left edge.

### Notes
- Installs over 3.1.0 and 3.0.x. Nothing else changed.

## [3.1.0] - 2026-10-22

### Added
- **Add a note or a task when you replay.** A recording can now contain "Add note" and "Add task" steps. Add them in the review step after recording, or in **Manage recordings**, with a subject, text, and for a task a due date (days from the day you replay) and a priority. Notes and tasks you add to the saved record in the timeline while you are recording are picked up automatically when you stop (attachments are not), and the pane counts them while you record. The text can use `{{today}}`, `{{now}}`, `{{user}}` and `{{column_name}}`. On a form the note or task is created when you apply the replay and the timeline is refreshed; on a grid one is created for every selected record, and **Undo last run** deletes exactly the notes and tasks that run created. A record that already has the identical note, or the identical open task, gets nothing extra.
- **Share with a business unit.** The share dialog has a new "Business unit" tab. Pick a business unit and choose: this unit only, this unit and the units below it, this unit and the units above it, or the whole branch. The recording is shared with the default team of each unit it covers. The platform keeps those teams filled, so people who join or leave a unit follow automatically; a business unit created later is not included until you share again. See `docs/configuration.md`.

### Changed
- **Recording detail in Manage recordings is two columns.** The steps are on the left and "Shared with" is on the right (it stays in view while you scroll). On a narrow window it becomes one column with "Shared with" at the top. "Stop sharing" is now an outlined button with an icon instead of plain text.
- **The version is shown at the bottom of every screen** (the side pane, Manage recordings and the grid dialog), so you can see that a page refresh loaded the latest files. If the command-bar script is older than the screen, a red line says so and asks you to reload the page.
- **Save and Discard are at the top of the review step** in the side pane and stay visible while you scroll through a long list of changes.

### Fixed
- Stopping a share left a row without any access right behind, which kept the recording listed as shared and counted in the "shared with" number. Such rows are now ignored.
- Skipped steps now have a red badge in the preview, and the "Save the record first" reason is shown as an error bar.

### Notes
- Notes and tasks can only be added to a saved record. On a new, unsaved form (or a table without notes or tasks) the step is skipped and the preview says why.
- Installs over 3.0.x without any data change. The recording step table gets one new value in its Operation choice. Recordings made with 3.1.0 that contain note or task steps are skipped in those steps by older versions.

## [3.0.1] - 2026-10-21

### Fixed
- **Editing an address line recorded a step that could not be replayed.** Changing "Address 1: Street 3" also made Dataverse update the composite column "Address 1", which is not on the form as a field, so the recording contained a second step that was skipped with "Column is not on this form". Recording now leaves out every column Dataverse fills in itself: the address composite, a contact's full name, created and modified dates, and calculated, rollup and formula columns. After you stop recording, the pane tells you which columns it left out. If the table's metadata cannot be read, recording works as before.

### Notes
- Existing recordings are not changed. A step for a left-out column is still skipped on replay, and you can delete it in **Manage recordings**.
- Columns that a business rule or a script sets are still recorded, because they cannot be told apart from a change you made. Remove them in the review step if the rule sets them anyway when you replay.

## [3.0.0] - 2026-10-21

### Changed (breaking)
- **New publisher and prefix: Bassl Labs, `bassllab_`.** The solution was published as "MsftNL" with the prefix `msftnl_`. Every Dataverse component is renamed: the tables (`bassllab_updaterecording`, `bassllab_updaterecordingstep`), their columns, the four settings (`bassllab_FormUpdateReplay_Apps`, `_Tables`, `_GridApps`, `_GridTables`), the web resources, the role privileges and the command-bar IDs. The choice values of the recording tables use a new option value prefix as well. Behaviour and screens are unchanged.
- **3.0.0 cannot be installed over 1.x or 2.x.** A solution cannot change publisher and Dataverse tables cannot be renamed, so this is a new solution. Remove the old one first (this deletes its recordings), then install 3.0.0 and set the four settings again. Existing recordings and setting values are not carried over. See `docs/installation.md`.

### Removed
- The hidden legacy global command. It only existed so that upgrading from 1.0.x could not show two Replay buttons, which no longer applies.

## [2.1.0] - 2026-10-20

### Added
- **Replay on selected records in a grid.** Select records in a list or in a subgrid and choose Replay in the command bar. Pick a recording, answer any questions once, review a preview ("N records will change") and confirm. The records are updated through the Web API, five at a time, up to 250 per run. A record that someone else changes between the preview and the update is skipped and reported.
- **A CSV of every run** with the old and new value of each column and the result per record.
- **Undo last run.** Restores the old values of the last run on a table, but only for columns that still hold the value the run wrote. It is kept until the page is reloaded.
- **Separate switches for grids.** Two new settings, `msftnl_FormUpdateReplay_GridApps` (default `none`) and `msftnl_FormUpdateReplay_GridTables` (default `*`), control where the grid button is shown. It stays off until an administrator enables it, because it changes many records at once. The button also needs the same read access to the recording table as the form button. See `docs/configuration.md`.

### Changed
- Updating records in a grid does not run form scripts or business rules (there is no form). Server-side logic such as plug-ins and flows still runs. The dialog says so.
- Installing or upgrading republishes the command bar of every table again (several minutes).

## [2.0.0] - 2026-10-19

### Added
- **Control where Replay is shown.** Two solution settings, `msftnl_FormUpdateReplay_Apps` (default `none`) and `msftnl_FormUpdateReplay_Tables` (default `*`), choose the model-driven apps and tables that show the Replay button. They are set once as environment values. See `docs/configuration.md`.
- **The button follows the security roles.** Replay is shown only to users who can read the recording table, which the shipped User and Admin roles do.

### Changed
- **Replay is off until an administrator enables it.** After installing or upgrading, set `msftnl_FormUpdateReplay_Apps`, for example to `msdyn_CustomerServiceWorkspace,Customerservicehub`. Existing recordings are not touched.
- The Replay button is now a classic ribbon button defined in the solution (application ribbon plus display rules) instead of a modern global command, because only that can be hidden by role, app and table. The old global command stays in the package but hidden, so an upgrade cannot leave two buttons. Installing or upgrading republishes the command bar of every table and takes several minutes.

## [1.0.3] - 2026-10-16

### Changed
- The side pane no longer depends on the deprecated `Xrm.Page`. The record on screen now comes from the documented `Xrm.Utility.getPageContext`, and the form from the Replay command. `Xrm.Page` is only used while it still exists, to follow you to records where Replay was not used yet. Without it, the pane shows "Select Replay in the command bar on this record to use it here" instead of a stale or empty form.

## [1.0.2] - 2026-10-16

### Fixed
- Hidden columns were still updated. A column that is hidden on the form (its field, section or tab) now counts as not on the form: the step is skipped in the preview with "Column is not on this form", and a copy or calculation that reads a hidden column is skipped as well. Apply also refuses a column that was hidden after the preview.

### Changed
- The full copyright notices and license texts of the bundled third-party packages are in `THIRD-PARTY-NOTICES.md` and at the end of the shipped `furep.hub.js`.
- README: disclaimer and a note about the shared form-context approach.

## [1.0.1] - 2026-10-16

### Changed
- Clearer look for the recordings overview and the recording editor: gradient header, grey panels for settings, numbered step cards with an accent bar, bold field labels, a tinted calculation summary and a tinted table header and selection.

## [1.0.0] - 2026-10-16

First stable release. Everything from 0.1.0 plus Calculate.

### Added
- **Calculate** as a fourth value source. It is a structured step, not a formula language, so it needs no extra components:
  - Date columns: start from today or now, the current value, another column or a fixed date, then add or subtract days, weeks, months, years or working days (Mon-Fri).
  - Text columns: add after, add before or replace, with an optional separator and the placeholders `{{today}}`, `{{now}}`, `{{user}}` and `{{column}}`.
  - Number columns: add, subtract, multiply or add a percentage, with a fixed number or another column, rounded to the column precision.
  - Calculations see what earlier steps of the same replay set. The preview shows the result, and a step is skipped with a clear reason when an input is missing or invalid.
- New column `msftnl_calculation` and option *Calculate* (Berekenen) on `msftnl_updaterecordingstep`. Existing recordings keep working unchanged.
- Six new screenshots and a new 3.5 minute narrated demo video that covers Calculate, with a natural neural voice instead of the robotic one.

### Changed
- The preview shows date-only values as dates in your regional format, numbers with digit grouping, and keeps line breaks in text.

### Fixed
- Working-day calculations could hang when the start date was midnight on the day daylight saving time ends; they now step by calendar day.

## [0.1.0] - 2026-10-15

First release.

### Added
- Global **Replay** command on the main form of every table in every model-driven app, including the multi-session Copilot Service workspace.
- Side pane (with the same logo as the command) to record column changes, review them, save them, and preview and apply a recording on another record. Cards stay readable in a narrow pane.
- Three ways to get a value: the **fixed value** that was recorded, **ask when replaying** and **copy from column**.
  - Asking shows an input that matches the column type on the open form (choice list, yes/no, number, date, text, multi-select, record picker for lookups) and validates the answer against the target column. Nothing is stored for these steps.
  - Copying offers only columns of a compatible type (same type, text into long text, whole number into decimal or currency, the same option set, a lookup with a shared target table, the same date format) and checks the value again when replaying.
- Management dialog with *My recordings*, *Shared by me*, *Shared with me*, *Team recordings* and *All recordings* (admins). Rows are selected with a round control: open and rename need one row; share, assign to a team and delete work on several. A *Shared* column shows Yes (3) or No, and a recording opens in a detail view to reorder, edit, see who it is shared with and stop sharing.
- Tables `msftnl_updaterecording` and `msftnl_updaterecordingstep` (user or team owned, parental cascade so sharing and assignment follow the recording).
- Security roles *Form Update Replay User* and *Form Update Replay Admin*, limited to the two recording tables.
- Dutch and English user interface, chosen from the user's language.
- Build and release workflows with pinned actions, version check, bundle sync, and third-party notices that are also kept inside the shipped web resources.
- Screenshots and a short narrated demo video.

### Security
- Everything runs as the signed-in user through documented client APIs and the Dataverse Web API; there are no plug-ins, external calls or stored credentials.
- Searches are URL-encoded, and saving the steps of a recording never leaves it without steps when a request fails.
