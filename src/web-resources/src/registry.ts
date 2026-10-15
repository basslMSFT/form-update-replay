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

/**
 * The form the user is looking at right now. Prefers the context captured by the command for this session and record,
 * and falls back to the page context so the pane keeps following the user to other records.
 */
export function currentForm(top: Window = window.top as Window): FormEntry | null {
  const reg = getRegistry(top);
  let page: Xrm.FormContext | undefined;
  try {
    const x = (top as unknown as { Xrm?: { Page?: Xrm.FormContext } }).Xrm;
    if (x?.Page?.data?.entity) page = x.Page;
  } catch {
    // no form on screen
  }
  if (!page) return null;
  const live = entryFromForm(page, top);
  const captured = reg.forms[live.key];
  return captured ? { ...captured, seenAt: Date.now() } : live;
}
