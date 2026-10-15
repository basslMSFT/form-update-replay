# Form Update Replay

Record the column changes you make on a Dynamics 365 form and replay them on other records. Works on every table, every form and every model-driven app, including the multi-session Copilot Service workspace. Dutch and English, chosen automatically from the user's language.

## How it works

1. Open a record and click **Replay** in the command bar (use the "..." menu if it is not visible). A side pane opens.
2. Click **Start recording**, change columns on the form, then click **Stop recording**.
3. Review the changes. For each change choose where the value comes from: the **fixed value** you recorded, **ask when replaying** (you pick or type a value that fits the column, for example a choice list for an option set or a record picker for a lookup), or **copy from column** (only columns of a compatible type are offered). Give the recording a name and save it.
4. On another record of the same table, open the pane, choose the recording and click **Preview**. You see what will change and why anything is skipped. **Apply to form** sets the values on the open form; you save the form yourself.
5. **Manage recordings** opens a dialog with *My recordings*, *Shared by me*, *Shared with me*, *Team recordings* and (for admins) *All recordings*. The grid shows whether a recording is shared and with how many people or teams, for example *Yes (3)*. Open a recording to change the order of its changes, edit them, see who it is shared with and stop sharing. Select one or more rows with the round control to enable the actions: open and rename need exactly one row; share, assign to a team and delete work on several.

Recordings are private to their owner until you share them or assign them to a team.

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

Replaying never grants more access than the user already has: values are set on the open form, so read-only and secured columns are skipped and the normal save rules apply.

## What is stored

Each recording is a row in `msftnl_updaterecording` with one child row per change in `msftnl_updaterecordingstep` (column, type, value, how the value is obtained). Everything stays in your Dataverse environment. Nothing is sent anywhere else. Recorded values are visible to everyone the recording is shared with, so use **Ask when replaying** for personal or sensitive values.

## Supported columns

Text, multi-line text, whole number, decimal, float, currency, yes/no, date and time, date only, choice, choices and lookup. Other column types (images, files, calculated and so on) are ignored while recording.

## Limitations

- Replay sets values on the open form only. It does not change records in the background.
- Many apps, including the Copilot Service workspace, autosave. Applied values are then saved shortly after you apply them, so look at the preview first.
- Lookups are replayed by record, so the target record must exist in the environment.
- A recording only applies to forms of the table it was recorded on.

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

MIT. See [LICENSE](LICENSE). Third-party notices are in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
