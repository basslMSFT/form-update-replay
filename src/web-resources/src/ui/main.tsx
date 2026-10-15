import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { FluentProvider, Spinner, webLightTheme } from "@fluentui/react-components";
import { AppContext, AppCtx, errorText } from "./context";
import { Pane } from "./Pane";
import { Hub } from "./Hub";
import { createApi, loadIdentity } from "../store";
import { getXrm } from "../controller";
import { langFromLcid, setLang } from "../i18n";

function dataParam(name: string): string | null {
  // Dataverse passes the "data" parameter of the navigation call as ?data=<url-encoded value>.
  const data = new URLSearchParams(window.location.search).get("data") ?? "";
  return new URLSearchParams(data).get(name);
}

function modeFromQuery(): "pane" | "dialog" {
  return dataParam("mode") === "dialog" ? "dialog" : "pane";
}

async function boot(): Promise<AppContext> {
  const xrm = getXrm();
  const g = xrm.Utility.getGlobalContext();
  // `lang=nl|en` in the navigation data overrides the user's language; handy for support and screenshots.
  const forced = dataParam("lang");
  setLang(forced === "nl" || forced === "en" ? forced : langFromLcid(g.userSettings.languageId));
  const api = createApi(g.getClientUrl());
  const roles = g.userSettings.roles.get().map((r) => r.name ?? "");
  const identity = await loadIdentity(api, g.userSettings.userId, roles);
  return { api, identity, xrm };
}

function App(): JSX.Element {
  const [ctx, setCtx] = useState<AppContext | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { boot().then(setCtx).catch((e) => setError(errorText(e))); }, []);
  if (error) return <div style={{ padding: 16 }}>{error}</div>;
  if (!ctx) return <Spinner style={{ marginTop: 40 }} />;
  return <AppCtx.Provider value={ctx}>{modeFromQuery() === "dialog" ? <Hub /> : <Pane />}</AppCtx.Provider>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FluentProvider theme={webLightTheme} style={{ background: "transparent", minHeight: "100vh" }}>
      <App />
    </FluentProvider>
  </StrictMode>,
);
