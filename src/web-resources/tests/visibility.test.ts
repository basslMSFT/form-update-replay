import { describe, expect, it, vi, beforeEach } from "vitest";
import { isAvailableFor, matchesList, parseList } from "../src/visibility";

describe("parseList", () => {
  it("splits on commas, semicolons and whitespace and lower-cases", () => {
    expect(parseList("Incident, Account;contact  lead")).toEqual(["incident", "account", "contact", "lead"]);
  });
  it("handles null, undefined and empty values", () => {
    expect(parseList(null)).toEqual([]);
    expect(parseList(undefined)).toEqual([]);
    expect(parseList("  ")).toEqual([]);
  });
});

describe("matchesList", () => {
  it("allows everything for *", () => {
    expect(matchesList("*", "incident")).toBe(true);
  });
  it("allows nothing for none or an empty list", () => {
    expect(matchesList("none", "incident")).toBe(false);
    expect(matchesList("", "incident")).toBe(false);
    expect(matchesList(undefined, "incident")).toBe(false);
  });
  it("matches listed names case-insensitively", () => {
    expect(matchesList("incident,account", "INCIDENT")).toBe(true);
    expect(matchesList("incident,account", "contact")).toBe(false);
  });
  it("supports exclusions with a leading minus", () => {
    expect(matchesList("*,-lead", "lead")).toBe(false);
    expect(matchesList("*,-lead", "account")).toBe(true);
    expect(matchesList("-lead", "account")).toBe(true);
    expect(matchesList("-lead", "lead")).toBe(false);
  });
  it("an exclusion wins over an explicit inclusion", () => {
    expect(matchesList("lead,-lead", "lead")).toBe(false);
  });
  it("never allows an unknown name", () => {
    expect(matchesList("*", null)).toBe(false);
    expect(matchesList("*", "")).toBe(false);
  });
  it("treats none as an inclusion of nothing even next to other tokens", () => {
    expect(matchesList("none,incident", "incident")).toBe(true);
    expect(matchesList("none", "none")).toBe(false);
  });
});

describe("isAvailableFor", () => {
  it("needs both the app and the table to be allowed", () => {
    expect(isAvailableFor("msdyn_customerserviceworkspace", "incident", "msdyn_CustomerServiceWorkspace", "incident")).toBe(true);
    expect(isAvailableFor("msdyn_customerserviceworkspace", "incident", "Customerservicehub", "incident")).toBe(false);
    expect(isAvailableFor("msdyn_customerserviceworkspace", "incident", "msdyn_CustomerServiceWorkspace", "account")).toBe(false);
  });
  it("is off by default: apps none hides everywhere", () => {
    expect(isAvailableFor("none", "*", "msdyn_CustomerServiceWorkspace", "incident")).toBe(false);
  });
  it("is on everywhere when both are *", () => {
    expect(isAvailableFor("*", "*", "anyapp", "anytable")).toBe(true);
  });
});

describe("isAvailable (command bar rule)", () => {
  type Settings = Record<string, unknown>;
  const install = (settings: Settings, app: string | Error, table?: string) => {
    const calls = { props: 0 };
    (globalThis as unknown as { Xrm: unknown }).Xrm = {
      Utility: {
        getGlobalContext: () => ({
          getCurrentAppSetting: (n: string) => settings[n],
          getCurrentAppProperties: () => {
            calls.props++;
            return app instanceof Error ? Promise.reject(app) : Promise.resolve({ uniqueName: app });
          },
        }),
        getPageContext: () => (table ? { input: { entityName: table } } : undefined),
      },
    };
    return calls;
  };

  beforeEach(() => {
    vi.resetModules();
  });

  it("shows the button in an enabled app on an enabled table", async () => {
    const { isAvailable: rule } = await import("../src/visibility");
    install({ msftnl_FormUpdateReplay_Apps: "msdyn_CustomerServiceWorkspace", msftnl_FormUpdateReplay_Tables: "incident" }, "msdyn_CustomerServiceWorkspace");
    expect(await rule("incident")).toBe(true);
    expect(await rule("account")).toBe(false);
  });

  it("is hidden by default (apps = none)", async () => {
    const { isAvailable: rule } = await import("../src/visibility");
    install({ msftnl_FormUpdateReplay_Apps: "none", msftnl_FormUpdateReplay_Tables: "*" }, "msdyn_CustomerServiceWorkspace");
    expect(await rule("incident")).toBe(false);
  });

  it("falls back to the page table when the ribbon passes none", async () => {
    const { isAvailable: rule } = await import("../src/visibility");
    install({ msftnl_FormUpdateReplay_Apps: "*", msftnl_FormUpdateReplay_Tables: "incident" }, "anyapp", "incident");
    expect(await rule()).toBe(true);
  });

  it("hides the button when the app cannot be determined", async () => {
    const { isAvailable: rule } = await import("../src/visibility");
    install({ msftnl_FormUpdateReplay_Apps: "*", msftnl_FormUpdateReplay_Tables: "*" }, new Error("no app"));
    expect(await rule("incident")).toBe(false);
  });

  it("hides the button when the settings do not exist", async () => {
    const { isAvailable: rule } = await import("../src/visibility");
    install({}, "anyapp");
    expect(await rule("incident")).toBe(false);
  });

  it("looks the app up once per page", async () => {
    const { isAvailable: rule } = await import("../src/visibility");
    const calls = install({ msftnl_FormUpdateReplay_Apps: "*", msftnl_FormUpdateReplay_Tables: "*" }, "anyapp");
    await rule("incident");
    await rule("account");
    await rule("contact");
    expect(calls.props).toBe(1);
  });
});
