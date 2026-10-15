# Changelog

All notable changes to this solution will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Management grid selects rows with the round selection control; open and rename need one row, share, assign to team and delete work on several rows. The row menu is gone.
- **Ask when replaying** shows an input that matches the column type on the open form: choice list, yes/no, number, date, text, multi-select and a lookup picker. The answer is validated against the target column before it is applied.
- **Copy from column** offers only columns of a compatible type (same type, text into long text, whole number into decimal/currency, the same option set, a lookup with a shared target table, the same date format) and checks the value again when replaying.
- The side pane shows the same logo as the command button.

### Changed
- Recorded values of "ask" and "copy" steps are no longer stored.
- A step with a fixed value that has no stored value is skipped instead of clearing the column.
- Side pane and change lists use stacked cards so they stay readable in a narrow pane.
- Grid colours, selection and hover underline follow the Dynamics 365 admin experience.
- Bundled third-party license notices are kept inside the shipped web resources.

## [0.1.0] - 2026-10-14

### Added
- Global **Replay** command on the main form of every table in every model-driven app, including the multi-session Copilot Service workspace.
- Side pane to record column changes, review them (fixed value, or ask when replaying), save them, and preview and apply a recording on another record.
- Management dialog with *My recordings*, *Shared by me*, *Shared with me*, *Team recordings* and *All recordings* (admins), a *Shared* column (Yes (3) or No), and open, rename, edit, reorder changes, share, see and stop sharing, assign to team and delete.
- Tables `msftnl_updaterecording` and `msftnl_updaterecordingstep` (user or team owned, parental cascade so sharing and assignment follow the recording).
- Security roles *Form Update Replay User* and *Form Update Replay Admin*.
- Dutch and English user interface, chosen from the user's language.
- Build and release workflows, version check, bundle sync and third-party notices.
