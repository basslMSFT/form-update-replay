import { describe, expect, it } from "vitest";
import { DICTIONARIES, langFromLcid, setLang, t } from "../src/i18n";

describe("localisation", () => {
  const placeholders = (s: string): string => (s.match(/\{\d+\}/g) ?? []).sort().join(",");

  it("has the same keys and placeholders in Dutch and English", () => {
    expect(Object.keys(DICTIONARIES.nl).sort()).toEqual(Object.keys(DICTIONARIES.en).sort());
    for (const key of Object.keys(DICTIONARIES.en) as Array<keyof typeof DICTIONARIES.en>) {
      expect(DICTIONARIES.nl[key], key).not.toBe("");
      expect(placeholders(DICTIONARIES.nl[key]), key).toBe(placeholders(DICTIONARIES.en[key]));
    }
  });

  it("switches on the Dutch language code and defaults to English", () => {
    expect(langFromLcid(1043)).toBe("nl");
    expect(langFromLcid(1033)).toBe("en");
    expect(langFromLcid(undefined)).toBe("en");
  });

  it("fills placeholders", () => {
    setLang("nl");
    expect(t("applied", 3)).toContain("3");
    setLang("en");
    expect(t("shareDone", "Team A")).toBe("Shared with Team A.");
  });
});
