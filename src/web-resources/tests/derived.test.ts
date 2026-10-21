import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Api } from "../src/store";
import { clearNonSettableCache, isNonSettable, loadNonSettable } from "../src/derived";

const attrs = [
  { LogicalName: "address1_composite", IsValidForCreate: false, IsValidForUpdate: false, SourceType: 0 },
  { LogicalName: "fullname", IsValidForCreate: false, IsValidForUpdate: false, SourceType: null },
  { LogicalName: "modifiedon", IsValidForCreate: false, IsValidForUpdate: false },
  { LogicalName: "address1_line3", IsValidForCreate: true, IsValidForUpdate: true, SourceType: 0 },
  { LogicalName: "name", IsValidForCreate: true, IsValidForUpdate: true },
  { LogicalName: "total_rollup", IsValidForCreate: false, IsValidForUpdate: true, SourceType: 2 },
  { LogicalName: "age_calc", IsValidForCreate: true, IsValidForUpdate: true, SourceType: 1 },
  { LogicalName: "only_on_create", IsValidForCreate: true, IsValidForUpdate: false, SourceType: 0 },
  { LogicalName: "only_on_update", IsValidForCreate: false, IsValidForUpdate: true, SourceType: 0 },
];

const api = (handler: (path: string) => unknown | Promise<unknown>): Api & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    async request(_m, path) {
      calls.push(path);
      return { data: { value: await handler(path) }, headers: new Headers() };
    },
  };
};

describe("isNonSettable", () => {
  it("flags columns that can never be written and columns that are calculated, rolled up or formulas", () => {
    expect(attrs.filter(isNonSettable).map((a) => a.LogicalName)).toEqual(["address1_composite", "fullname", "modifiedon", "total_rollup", "age_calc"]);
  });
  it("keeps columns that can be written on create or on update only, and columns with unknown flags", () => {
    expect(isNonSettable({ LogicalName: "x", IsValidForCreate: true, IsValidForUpdate: false })).toBe(false);
    expect(isNonSettable({ LogicalName: "x", IsValidForCreate: false, IsValidForUpdate: true })).toBe(false);
    expect(isNonSettable({ LogicalName: "x" })).toBe(false);
  });
});

describe("loadNonSettable", () => {
  beforeEach(() => clearNonSettableCache());

  it("returns the non-settable column names and asks for exactly the flags it needs", async () => {
    const a = api(() => attrs);
    const set = await loadNonSettable(a, "contact");
    expect([...set].sort()).toEqual(["address1_composite", "age_calc", "fullname", "modifiedon", "total_rollup"]);
    expect(a.calls).toEqual(["EntityDefinitions(LogicalName='contact')/Attributes?$select=LogicalName,IsValidForCreate,IsValidForUpdate,SourceType"]);
  });

  it("asks once per table", async () => {
    const a = api(() => attrs);
    await loadNonSettable(a, "contact");
    await loadNonSettable(a, "contact");
    await loadNonSettable(a, "account");
    expect(a.calls.length).toBe(2);
  });

  it("falls back to an empty set when the lookup fails, and tries again next time", async () => {
    let fail = true;
    const a = api(() => { if (fail) throw new Error("403: no metadata access"); return attrs; });
    expect((await loadNonSettable(a, "contact")).size).toBe(0);
    fail = false;
    expect((await loadNonSettable(a, "contact")).size).toBe(5);
  });

  it("does not wait longer than the timeout", async () => {
    vi.useFakeTimers();
    try {
      const a = api(() => new Promise(() => undefined));
      const p = loadNonSettable(a, "contact", 1000);
      await vi.advanceTimersByTimeAsync(1000);
      expect((await p).size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses an unsafe table name without leaving it in the request", async () => {
    const a = api(() => attrs);
    expect((await loadNonSettable(a, "a')/x")).size).toBe(0);
    expect(a.calls).toEqual([]);
  });
});
