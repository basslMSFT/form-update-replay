# Changelog

All notable changes to this solution will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

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
