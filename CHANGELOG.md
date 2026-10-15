# Changelog

All notable changes to this solution will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

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
