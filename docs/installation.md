# Installation

1. Download `FormUpdateReplay_<version>_managed.zip` from the [Releases](../../releases) page.
2. Go to **make.powerapps.com**, select the environment, open **Solutions** and choose **Import solution**.
3. Upload the zip, complete the wizard and choose **Publish all customizations**.
4. Assign the security roles and turn Replay on for your apps and tables (see [configuration.md](configuration.md)). Replay is hidden everywhere until you set `msftnl_FormUpdateReplay_Apps`.
5. Hard-reload the model-driven app. The **Replay** button appears on forms of enabled tables; if the command bar is full it is under the "..." menu. The import republishes the command bar of every table, so allow several minutes before it shows up.

Command line:

```bash
pac auth create --url https://YOUR_ORG.crm.dynamics.com
pac solution import --path FormUpdateReplay_<version>_managed.zip --publish-changes
```

No other solutions are required. Use the unmanaged zip only if you want to change the solution yourself.

## Upgrade from 1.0.x

Import the new managed zip over the old one. The previous global command is kept but hidden, and the new Replay button follows the settings, so **Replay is hidden until you set `msftnl_FormUpdateReplay_Apps`**. Recordings are not touched.

## Uninstall

Delete the managed solution. This also deletes all recordings, because they are rows in the solution's tables.
