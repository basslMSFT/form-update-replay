# Configuration

There are no connection references. Where the Replay buttons appear is controlled by four settings and the security roles: two settings for the form button and two for the grid button.

## Where the Replay button appears

The **form button** is shown when **all three** are true:

1. The current **app** is allowed by `msftnl_FormUpdateReplay_Apps`.
2. The current **table** is allowed by `msftnl_FormUpdateReplay_Tables`.
3. The user has **read access to the recording table**, which both shipped roles give.

The **grid button** (Replay on the selected records in a list or subgrid) follows the same rules with its own pair of settings, `msftnl_FormUpdateReplay_GridApps` and `msftnl_FormUpdateReplay_GridTables`, because it changes many records at once and an administrator may want it in fewer apps or on fewer tables than the form button. The table it checks is the table **shown in the grid**, so on a subgrid of cases inside an account form, `incident` decides, not `account`. It is also enabled only while at least one row is selected.

After installation `msftnl_FormUpdateReplay_Apps` and `msftnl_FormUpdateReplay_GridApps` are `none`, so Replay is hidden until an administrator enables it.

| Setting | Type | Default | Values |
|---------|------|---------|--------|
| `msftnl_FormUpdateReplay_Apps` | Text | `none` | Comma-separated unique names of model-driven apps. `*` for every app, `none` for no app. |
| `msftnl_FormUpdateReplay_Tables` | Text | `*` | Comma-separated logical table names. `*` for every table. Prefix a name with `-` to exclude it. |
| `msftnl_FormUpdateReplay_GridApps` | Text | `none` | The same, for the grid button. |
| `msftnl_FormUpdateReplay_GridTables` | Text | `*` | The same, for the grid button. |

Names are not case-sensitive. Separators can be commas, semicolons or spaces.

| Goal | Apps | Tables |
|------|------|--------|
| Only in the Copilot Service workspace, on cases | `msdyn_CustomerServiceWorkspace` | `incident` |
| In two apps, on cases, accounts and contacts | `msdyn_CustomerServiceWorkspace,Customerservicehub` | `incident,account,contact` |
| Everywhere except leads | `*` | `*,-lead` |
| Switched off | `none` | anything |

The same examples apply to the grid settings. A common setup is form Replay in both apps and grid Replay only in the one app where people do bulk work.

### How to change the settings

Both settings are meant to be set once for the **whole environment**. Because the apps setting already lists the apps that show Replay, one environment value controls which apps and tables are enabled; you do not need a different value per app.

**Tested: set an environment value with the Web API.** Call the documented [SaveSettingValue](https://learn.microsoft.com/power-apps/developer/data-platform/webapi/reference/savesettingvalue) action with `SettingName` and `Value` and leave `AppUniqueName` out. For example, to enable Replay on forms and in grids in two apps:

```http
POST [org]/api/data/v9.2/SaveSettingValue
{ "SettingName": "msftnl_FormUpdateReplay_Apps", "Value": "msdyn_CustomerServiceWorkspace,Customerservicehub" }

POST [org]/api/data/v9.2/SaveSettingValue
{ "SettingName": "msftnl_FormUpdateReplay_GridApps", "Value": "msdyn_CustomerServiceWorkspace,Customerservicehub" }
```

**Opened and seen, saving not tested: the settings screen in the maker portal.** In [make.powerapps.com](https://make.powerapps.com), select the environment, open **Solutions**, then open **Form Update Replay**. Select the setting **Form Update Replay: apps**, **Form Update Replay: tables**, **Form Update Replay: apps (grids)** or **Form Update Replay: tables (grids)** (type *Setting*) in the list of items. The **Edit** panel shows the description, the default value, and under **Setting environment value** the value for your environment, which is where you type a new value. The screen showed the value that had been set with the Web API above, so both routes edit the same value. Editing and saving a value on the screen was not tried, so use the Web API call if saving fails. Microsoft describes the screen in [Use settings to provide customized app experiences](https://learn.microsoft.com/power-apps/maker/data-platform/create-edit-configure-settings); the documentation says it needs **Solution preview** to be on in the Solutions area.

**Per-app values are not supported by this solution.** The same panel has a **Setting app values** section. A per-app value overrides the environment value for one app. Setting one through the Web API did not work in testing (the call reported success but nothing was stored, and inserting the row directly failed), and per Microsoft's documentation the screen only offers it for apps that are in the solution, which Form Update Replay does not contain. Do not rely on it; put every app name in the environment value instead.

Reload the app (Ctrl+F5) after a change.

**Finding an app's unique name:** query the Web API, `GET [org]/api/data/v9.2/appmodules?$select=uniquename,name`. Examples: `msdyn_CustomerServiceWorkspace` (Copilot Service workspace), `Customerservicehub` (Customer Service Hub).

> The settings decide where the button is shown. They do not secure anything. A user who somehow opens the Replay page can still only read and change what their Dataverse roles allow.

## Security roles

Assign the roles next to the role people already have.

| Role | Use for |
|------|---------|
| Form Update Replay User | Everyone who records or replays. Create, read, edit, delete, assign and share their own recordings at User level; use recordings shared with them or their teams. |
| Form Update Replay Admin | Administrators who need to see and manage every recording (*All recordings* tab). Organization-level rights on the two tables. |

A team can own recordings (use *Assign to team* in the management dialog). Give the team the User role so its members can use them.

## Language

The interface follows the user's language setting: Dutch (1043) shows Dutch, every other language shows English.

## Auditing

Replay on a form changes the open form, and the normal save and audit rules of the target table apply. Replay on selected records updates each record through the Web API as the signed-in user, so auditing, plug-ins and flows on the table run for every updated record, but form scripts and business rules do not. Enable auditing on a table if you need to see who changed what; the CSV of a run is a second record of the old and new values.
