# Installation

1. Download `FormUpdateReplay_<version>_managed.zip` from the [Releases](../../releases) page.
2. Go to **make.powerapps.com**, select the environment, open **Solutions** and choose **Import solution**.
3. Upload the zip, complete the wizard and choose **Publish all customizations**.
4. Assign the security roles (see [configuration.md](configuration.md)).
5. Hard-reload the model-driven app. The **Replay** command appears on every form; if the command bar is full it is under the "..." menu. Publishing can take a few minutes before the command shows up.

Command line:

```bash
pac auth create --url https://YOUR_ORG.crm.dynamics.com
pac solution import --path FormUpdateReplay_<version>_managed.zip --publish-changes
```

No other solutions are required. Use the unmanaged zip only if you want to change the solution yourself.

## Uninstall

Delete the managed solution. This also deletes all recordings, because they are rows in the solution's tables.
