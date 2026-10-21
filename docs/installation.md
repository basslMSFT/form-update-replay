# Installation

1. Download `FormUpdateReplay_<version>_managed.zip` from the [Releases](../../releases) page.
2. Go to **make.powerapps.com**, select the environment, open **Solutions** and choose **Import solution**.
3. Upload the zip, complete the wizard and choose **Publish all customizations**.
4. Assign the security roles and turn Replay on for your apps and tables (see [configuration.md](configuration.md)). Replay is hidden everywhere until you set `bassllab_FormUpdateReplay_Apps`.
5. Hard-reload the model-driven app. The **Replay** button appears on forms of enabled tables; if the command bar is full it is under the "..." menu. The import republishes the command bar of every table, so allow several minutes before it shows up.

Command line:

```bash
pac auth create --url https://YOUR_ORG.crm.dynamics.com
pac solution import --path FormUpdateReplay_<version>_managed.zip --publish-changes
```

No other solutions are required. Use the unmanaged zip only if you want to change the solution yourself.

## Moving from 1.x or 2.x to 3.0

Version 3.0.0 is published under a new publisher (Bassl Labs, prefix `bassllab_`). A solution cannot change publisher and Dataverse tables cannot be renamed, so **3.0.0 cannot be imported over 1.x or 2.x**: the import is refused with "The publisher name cannot be changed from 'MSFTNL' to 'bassllab'" (in testing this took about 30 minutes to appear). It is a new solution that has to be installed after the old one is removed. Roles with the same name as the old ones also cannot exist next to the new ones.

1. Note the values of the settings you use (`msftnl_FormUpdateReplay_Apps`, `_Tables`, and for 2.1 `_GridApps`, `_GridTables`) and write down any recordings you want to keep. There is no automatic copy of recordings: they live in the old tables, and removing the old solution deletes them.
2. Delete the old **Form Update Replay** solution (managed) in **Solutions**. This removes its tables, roles, settings and command-bar buttons.
3. Install 3.0.0 as described above, assign the new **Form Update Replay User** and **Form Update Replay Admin** roles, and set the four `bassllab_FormUpdateReplay_*` settings (see [configuration.md](configuration.md)).
4. Record your recordings again.

## Uninstall

Delete the managed solution. This also deletes all recordings, because they are rows in the solution's tables.
