import { ReactElement } from "react";
import { Text, makeStyles, tokens } from "@fluentui/react-components";
import { getRegistry } from "../registry";
import { VERSION } from "../version";
import { t } from "../i18n";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXXS, paddingTop: tokens.spacingVerticalS, color: tokens.colorNeutralForeground3 },
  warn: { color: tokens.colorPaletteRedForeground1 },
});

/**
 * The version of this screen. The command-bar script is a separate file that the browser keeps until the page is reloaded,
 * so when its version differs the label says so; that tells you the page still runs an older script.
 */
export function VersionLabel(): ReactElement {
  const s = useStyles();
  let script: string | undefined;
  try { script = getRegistry().libraryVersion; } catch { /* no top window access; show only our own version */ }
  return (
    <div className={s.root}>
      <Text size={200}>{t("versionLabel", VERSION)}</Text>
      {script && script !== VERSION ? <Text size={200} className={s.warn}>{t("versionMismatch", script)}</Text> : null}
    </div>
  );
}
