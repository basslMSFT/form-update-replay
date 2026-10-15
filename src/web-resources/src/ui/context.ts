import { createContext, useContext } from "react";
import { Api, Identity } from "../store";

export interface AppContext {
  api: Api;
  identity: Identity;
  xrm: typeof Xrm;
}

export const AppCtx = createContext<AppContext | null>(null);

export function useApp(): AppContext {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("App context missing");
  return ctx;
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
