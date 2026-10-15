import { FormLike, Recorder } from "./recorder";
import { AttrLike } from "./value-codec";

/** State shared between the command library, the side pane and the dialog. It lives on the top window. */
export interface FormEntry {
  key: string;
  fc: Xrm.FormContext;
  entity: string;
  id: string;
  sessionId: string;
  seenAt: number;
}

export interface Registry {
  forms: Record<string, FormEntry>;
  recorders: Record<string, Recorder>;
}

type TopWindow = Window & { __formUpdateReplay?: Registry; Microsoft?: { Apm?: { getFocusedSession?: () => { sessionId?: string } | undefined } } };

export function getRegistry(top: Window = window.top as Window): Registry {
  const w = top as TopWindow;
  return (w.__formUpdateReplay ??= { forms: {}, recorders: {} });
}

/** Multi-session apps (Copilot Service workspace) expose the focused session; other apps have a single implicit one. */
export function focusedSessionId(top: Window = window.top as Window): string {
  try {
    const s = (top as TopWindow).Microsoft?.Apm?.getFocusedSession?.();
    if (s?.sessionId) return String(s.sessionId);
  } catch {
    // fall through to the single-session default
  }
  return "app";
}

export function formKey(sessionId: string, entity: string, id: string): string {
  return `${sessionId}|${entity}|${id.replace(/[{}]/g, "").toLowerCase() || "new"}`;
}

export function entryFromForm(fc: Xrm.FormContext, top: Window = window.top as Window): FormEntry {
  const entity = fc.data.entity.getEntityName();
  const id = (fc.data.entity.getId() || "").replace(/[{}]/g, "").toLowerCase();
  const sessionId = focusedSessionId(top);
  return { key: formKey(sessionId, entity, id), fc, entity, id, sessionId, seenAt: Date.now() };
}

export function toFormLike(fc: Xrm.FormContext): FormLike {
  return {
    entityName: fc.data.entity.getEntityName(),
    attributes: fc.data.entity.attributes.get() as unknown as AttrLike[],
  };
}

type PageInput = { pageType?: string; entityName?: string; entityId?: string };

/** Which record is on screen, from the documented `Xrm.Utility.getPageContext` (Unified Interface). */
export function recordOnScreen(top: Window = window.top as Window): { entity: string; id: string } | null {
  try {
    const x = (top as unknown as { Xrm?: { Utility?: { getPageContext?: () => { input?: PageInput } | undefined } } }).Xrm;
    const input = x?.Utility?.getPageContext?.()?.input;
    if (input?.pageType === "entityrecord" && input.entityName) return { entity: input.entityName, id: (input.entityId ?? "").replace(/[{}]/g, "").toLowerCase() };
  } catch {
    // no page context available
  }
  return null;
}

/** The deprecated `Xrm.Page`, used only when it still exists. Nothing breaks when Microsoft removes it. */
function legacyFormContext(top: Window): Xrm.FormContext | undefined {
  try {
    const page = (top as unknown as { Xrm?: { Page?: Xrm.FormContext } }).Xrm?.Page;
    if (page?.data?.entity) return page;
  } catch {
    // no form on screen
  }
  return undefined;
}

/**
 * The form the user is looking at right now. The documented page context says which record is on screen, and the
 * context captured by the Replay command for that session and record supplies the form. Where the deprecated
 * `Xrm.Page` still exists it also lets the pane follow the user to records where the command was not used yet.
 */
export function currentForm(top: Window = window.top as Window): FormEntry | null {
  const reg = getRegistry(top);
  const page = legacyFormContext(top);
  if (page) {
    const live = entryFromForm(page, top);
    const captured = reg.forms[live.key];
    return captured ? { ...captured, seenAt: Date.now() } : live;
  }
  const shown = recordOnScreen(top);
  if (!shown) return null;
  const captured = reg.forms[formKey(focusedSessionId(top), shown.entity, shown.id)];
  return captured ? { ...captured, seenAt: Date.now() } : null;
}
