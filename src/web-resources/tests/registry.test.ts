import { describe, expect, it } from "vitest";
import { currentForm, entryFromForm, getRegistry, recordOnScreen } from "../src/registry";

const fc = (entity: string, id: string) => ({ data: { entity: { getEntityName: () => entity, getId: () => id } } }) as unknown as Xrm.FormContext;
const win = (xrm: unknown) => ({ Xrm: xrm }) as unknown as Window;
const pageContext = (entityName: string, entityId: string) => ({ Utility: { getPageContext: () => ({ input: { pageType: "entityrecord", entityName, entityId } }) } });

describe("current form", () => {
  it("uses the deprecated Xrm.Page while it exists, preferring the form the command captured", () => {
    const top = win({ Page: fc("incident", "{AAAA}") });
    const captured = fc("incident", "{AAAA}");
    const reg = getRegistry(top);
    const entry = entryFromForm(captured, top);
    reg.forms[entry.key] = entry;
    expect(currentForm(top)?.fc).toBe(captured);
  });

  it("works without Xrm.Page: the page context names the record and the command supplied the form", () => {
    const top = win(pageContext("incident", "{BBBB}"));
    const captured = fc("incident", "{BBBB}");
    const entry = entryFromForm(captured, top);
    getRegistry(top).forms[entry.key] = entry;
    expect(currentForm(top)?.fc).toBe(captured);
  });

  it("does not return a stale form when the user moved to a record the command was not used on", () => {
    const top = win(pageContext("incident", "{CCCC}"));
    const old = entryFromForm(fc("incident", "{DDDD}"), top);
    getRegistry(top).forms[old.key] = old;
    expect(currentForm(top)).toBeNull();
    expect(recordOnScreen(top)).toEqual({ entity: "incident", id: "cccc" });
  });

  it("returns nothing on a list page or when neither API exists", () => {
    expect(currentForm(win({ Utility: { getPageContext: () => ({ input: { pageType: "entitylist", entityName: "incident" } }) } }))).toBeNull();
    expect(recordOnScreen(win({}))).toBeNull();
    expect(currentForm(win({}))).toBeNull();
  });
});
