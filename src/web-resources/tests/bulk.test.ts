import { describe, expect, it } from "vitest";
import type { Api } from "../src/store";
import type { Step } from "../src/model";
import type { BulkColumn, TableMeta } from "../src/bulk-meta";
import { neededColumns, loadTableMeta } from "../src/bulk-meta";
import {
  CONCURRENCY, changesFrom, csvCell, csvRows, decodeValue, displayValue, loadRecord, loadRecords, planRecord, readApiDate, runBulk, summarize, toCsv, undoRun, writeApiDate, writeChanges,
} from "../src/bulk";

const col = (name: string, type: string, extra: Partial<BulkColumn> = {}): BulkColumn => ({ name, label: name.toUpperCase(), type, format: null, behavior: null, canUpdate: true, ...extra });

function makeMeta(): TableMeta {
  const columns = new Map<string, BulkColumn>([
    ["title", col("title", "string", { maxLength: 10 })],
    ["prio", col("prio", "optionset", { options: [{ value: 1, text: "High" }, { value: 2, text: "Low" }] })],
    ["amount", col("amount", "money", { precision: 2, min: 0 })],
    ["tags", col("tags", "multiselectoptionset", { options: [{ value: 1, text: "A" }, { value: 2, text: "B" }] })],
    ["customerid", col("customerid", "lookup", { targets: ["account", "contact"] })],
    ["locked", col("locked", "string", { canUpdate: false })],
    ["due", col("due", "datetime", { format: "date", behavior: "DateOnly" })],
  ]);
  return {
    table: "incident",
    entitySet: "incidents",
    idAttribute: "incidentid",
    nameAttribute: "title",
    columns,
    navProps: new Map([["customerid|account", "customerid_account"], ["customerid|contact", "customerid_contact"]]),
    entitySets: new Map(),
  };
}

const step = (column: string, columnType: string, extra: Partial<Step> = {}): Step => ({ sortOrder: 10, operation: "set", valueMode: "fixed", column, columnType, ...extra });
const ID = (n: number): string => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

type Rec = Record<string, any>;

/** A tiny in-memory Dataverse: records, ETags, If-Match, lookups and the calls made. */
class FakeApi implements Api {
  records = new Map<string, Rec>();
  calls: string[] = [];
  inflight = 0;
  maxInflight = 0;
  failOn = new Set<string>();
  editBefore = new Map<string, () => void>();
  private version = 1;

  add(id: string, fields: Rec): void {
    this.records.set(id, { incidentid: id, ...fields, "@odata.etag": `W/"${this.version++}"` });
  }

  async request(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    this.calls.push(`${method} ${path}`);
    this.inflight++;
    this.maxInflight = Math.max(this.maxInflight, this.inflight);
    try {
      await new Promise((r) => setTimeout(r, 2));
      const def = /^EntityDefinitions\(LogicalName='(\w+)'\)\?/.exec(path);
      if (def) return { data: { EntitySetName: def[1] === "account" ? "accounts" : "contacts" }, headers: new Headers() };
      const rec = /^incidents\(([0-9a-f-]{36})\)(\/(\w+)\/\$ref)?/.exec(path);
      if (!rec) throw new Error(`404: ${path}`);
      const id = rec[1]!;
      const row = this.records.get(id);
      if (!row) throw new Error("404: not found");
      if (this.failOn.has(id)) throw new Error("403: no write access");
      if (method === "GET") return { data: { ...row }, headers: new Headers() };
      this.editBefore.get(id)?.();
      if (method === "DELETE") {
        const attr = rec[3] === "customerid_account" || rec[3] === "customerid_contact" ? "customerid" : "";
        delete row[`_${attr}_value`];
        delete row[`_${attr}_value@Microsoft.Dynamics.CRM.lookuplogicalname`];
        return { data: null, headers: new Headers() };
      }
      const match = headers["If-Match"];
      if (match !== "*" && match !== row["@odata.etag"]) throw new Error("412: The version of the record does not match");
      for (const [k, v] of Object.entries(body as Rec)) {
        if (k.endsWith("@odata.bind")) {
          const m = /^\/(\w+)\(([0-9a-f-]{36})\)$/.exec(v as string)!;
          row["_customerid_value"] = m[2];
          row["_customerid_value@Microsoft.Dynamics.CRM.lookuplogicalname"] = m[1] === "accounts" ? "account" : "contact";
        } else row[k] = v;
      }
      row["@odata.etag"] = `W/"${this.version++}"`;
      return { data: null, headers: new Headers() };
    } finally {
      this.inflight--;
    }
  }
}

describe("dates", () => {
  const dateOnly = col("d", "datetime", { format: "date", behavior: "DateOnly" });
  const local = col("d", "datetime", { format: "datetime", behavior: "UserLocal" });
  const independent = col("d", "datetime", { format: "datetime", behavior: "TimeZoneIndependent" });

  it("reads date-only values as the same calendar day", () => {
    const d = readApiDate(dateOnly, "2026-10-20");
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 9, 20]);
  });

  it("reads time-zone-independent values without converting them", () => {
    const d = readApiDate(independent, "2026-10-20T10:30:00Z");
    expect([d.getDate(), d.getHours(), d.getMinutes()]).toEqual([20, 10, 30]);
  });

  it("round-trips a time-zone-independent value through the stored ISO form", () => {
    const stored = readApiDate(independent, "2026-10-20T10:30:00Z").toISOString();
    expect(writeApiDate(independent, stored)).toBe("2026-10-20T10:30:00Z");
  });

  it("writes date-only columns as a plain date", () => {
    expect(writeApiDate(dateOnly, "2026-10-20")).toBe("2026-10-20");
  });

  it("writes a date in a user-local column as local midnight", () => {
    const d = new Date(writeApiDate(local, "2026-10-20"));
    expect([d.getDate(), d.getHours()]).toEqual([20, 0]);
  });
});

describe("decodeValue", () => {
  it("reads lookups with their table and name", () => {
    const v = decodeValue(col("customerid", "lookup"), { _customerid_value: "abc", "_customerid_value@Microsoft.Dynamics.CRM.lookuplogicalname": "account", "_customerid_value@OData.Community.Display.V1.FormattedValue": "Contoso" });
    expect(v).toEqual([{ id: "abc", entityType: "account", name: "Contoso" }]);
  });
  it("reads multi-select values as numbers and an empty value as null", () => {
    const c = col("tags", "multiselectoptionset");
    expect(decodeValue(c, { tags: "2,1" })).toEqual([2, 1]);
    expect(decodeValue(c, { tags: "" })).toBeNull();
    expect(decodeValue(c, {})).toBeNull();
  });
});

describe("planRecord", () => {
  const meta = makeMeta();
  const rec = (raw: Rec) => ({ id: ID(1), name: "r", etag: "e", raw });

  it("plans changes, no-ops and skips with the form engine's reasons", () => {
    const items = planRecord(meta, rec({ title: "Old", prio: 2 }), [
      step("title", "string", { value: "New" }),
      step("prio", "optionset", { sortOrder: 20, value: 2 }),
      step("locked", "string", { sortOrder: 30, value: "x" }),
      step("nothere", "string", { sortOrder: 40, value: "x" }),
      step("prio", "optionset", { sortOrder: 50, value: 9 }),
    ]);
    expect(items.map((i) => [i.step.column, i.status, i.reason])).toEqual([
      ["title", "apply", undefined],
      ["prio", "noop", undefined],
      ["locked", "skip", "readonly"],
      ["nothere", "skip", "missing"],
      ["prio", "skip", "valueNotAllowed"],
    ]);
  });

  it("rejects values the column cannot hold", () => {
    const items = planRecord(meta, rec({ title: "x" }), [step("title", "string", { value: "far too long for ten" }), step("amount", "money", { sortOrder: 20, value: -5 })]);
    expect(items.map((i) => i.reason)).toEqual(["valueNotAllowed", "valueNotAllowed"]);
  });

  it("copies from another column of the same record and clears values", () => {
    const items = planRecord(meta, rec({ title: "abc", locked: "SRC" }), [step("title", "string", { valueMode: "copy", sourceColumn: "locked" }), step("prio", "optionset", { sortOrder: 20, operation: "clear" })]);
    expect(items[0]).toMatchObject({ status: "apply", next: "SRC" });
    expect(items[1]).toMatchObject({ status: "noop" });
  });

  it("leaves 'ask me' steps open until they are answered", () => {
    const steps = [step("title", "string", { valueMode: "prompt" })];
    expect(planRecord(meta, rec({ title: "a" }), steps)[0]).toMatchObject({ status: "skip", reason: "needsInput" });
    expect(planRecord(meta, rec({ title: "a" }), steps, { answers: { title: "b" } })[0]).toMatchObject({ status: "apply", next: "b" });
  });

  it("sees multi-select and lookup values", () => {
    const items = planRecord(meta, rec({ tags: "1", _customerid_value: ID(5), "_customerid_value@Microsoft.Dynamics.CRM.lookuplogicalname": "account" }), [
      step("tags", "multiselectoptionset", { value: [1, 2] }),
      step("customerid", "lookup", { sortOrder: 20, value: { entityType: "account", id: ID(5) } }),
      step("customerid", "lookup", { sortOrder: 30, value: { entityType: "lead", id: ID(6) } }),
    ]);
    expect(items.map((i) => i.status)).toEqual(["apply", "noop", "skip"]);
    expect(items[2]!.reason).toBe("valueNotAllowed");
  });
});

describe("changesFrom", () => {
  it("keeps the first old value and the last new value of a column", () => {
    const meta = makeMeta();
    const items = planRecord(meta, { id: ID(1), name: "", etag: "", raw: { title: "o" } }, [step("title", "string", { value: "a" }), step("title", "string", { sortOrder: 20, value: "b" })]);
    expect(changesFrom(items)).toEqual([{ column: "title", type: "string", before: "o", after: "b" }]);
  });
});

describe("writeChanges", () => {
  it("sends plain columns with If-Match and never as an upsert", async () => {
    const api = new FakeApi();
    api.add(ID(1), { title: "o", "@odata.etag": 'W/"7"' });
    api.records.get(ID(1))!["@odata.etag"] = 'W/"7"';
    await writeChanges(api, makeMeta(), ID(1), [{ column: "title", type: "string", before: "o", after: "n" }], 'W/"7"');
    expect(api.records.get(ID(1))!.title).toBe("n");
    await expect(writeChanges(api, makeMeta(), ID(1), [{ column: "title", type: "string", before: "n", after: "z" }], 'W/"7"')).rejects.toThrow(/^412/);
  });

  it("binds a lookup through its navigation property and the target's entity set", async () => {
    const api = new FakeApi();
    api.add(ID(1), {});
    await writeChanges(api, makeMeta(), ID(1), [{ column: "customerid", type: "lookup", before: null, after: { entityType: "account", id: ID(9) } }], "*");
    expect(api.records.get(ID(1))!["_customerid_value"]).toBe(ID(9));
    expect(api.calls.some((c) => c.startsWith("GET EntityDefinitions(LogicalName='account')"))).toBe(true);
  });

  it("clears a lookup by deleting the reference of the current target", async () => {
    const api = new FakeApi();
    api.add(ID(1), { _customerid_value: ID(9), "_customerid_value@Microsoft.Dynamics.CRM.lookuplogicalname": "contact" });
    await writeChanges(api, makeMeta(), ID(1), [{ column: "customerid", type: "lookup", before: { entityType: "contact", id: ID(9) }, after: null }], "*");
    expect(api.calls).toContain(`DELETE incidents(${ID(1)})/customerid_contact/$ref`);
    expect(api.records.get(ID(1))!["_customerid_value"]).toBeUndefined();
  });

  it("reports a lookup it has no relationship for", async () => {
    const api = new FakeApi();
    api.add(ID(1), {});
    await expect(writeChanges(api, makeMeta(), ID(1), [{ column: "customerid", type: "lookup", before: null, after: { entityType: "lead", id: ID(9) } }], "*")).rejects.toThrow(/No relationship/);
  });

  it("writes multi-select values as a comma list and dates in the column's form", async () => {
    const api = new FakeApi();
    api.add(ID(1), {});
    await writeChanges(api, makeMeta(), ID(1), [{ column: "tags", type: "multiselectoptionset", before: null, after: [1, 2] }, { column: "due", type: "datetime", before: null, after: "2026-10-20" }], "*");
    expect(api.records.get(ID(1))).toMatchObject({ tags: "1,2", due: "2026-10-20" });
  });
});

describe("runBulk and undoRun", () => {
  const setup = (count: number) => {
    const api = new FakeApi();
    const meta = makeMeta();
    const ids = Array.from({ length: count }, (_, i) => ID(i + 1));
    ids.forEach((id, i) => api.add(id, { title: `r${i}`, prio: 2 }));
    return { api, meta, ids };
  };
  const prepare = async (api: FakeApi, meta: TableMeta, ids: string[], steps: Step[]) => {
    const records = await loadRecords(api, meta, ids);
    const plans = new Map(records.map((r) => [r.id, planRecord(meta, r, steps)]));
    return { records, plans };
  };

  it("updates all records, never more than the limit at once, and reports progress", async () => {
    const { api, meta, ids } = setup(12);
    const steps = [step("prio", "optionset", { value: 1 })];
    const { records, plans } = await prepare(api, meta, ids, steps);
    let last = 0;
    const out = await runBulk(api, meta, records, plans, { cancelled: false, onProgress: (d) => { last = d; } });
    expect(out.every((o) => o.status === "applied")).toBe(true);
    expect(ids.every((id) => api.records.get(id)!.prio === 1)).toBe(true);
    expect(api.maxInflight).toBeLessThanOrEqual(CONCURRENCY);
    expect(api.maxInflight).toBeGreaterThan(1);
    expect(last).toBe(12);
  });

  it("keeps going after a failure and skips records that changed since the preview", async () => {
    const { api, meta, ids } = setup(4);
    const { records, plans } = await prepare(api, meta, ids, [step("prio", "optionset", { value: 1 })]);
    api.failOn.add(ids[1]!);
    api.editBefore.set(ids[2]!, () => { api.records.get(ids[2]!)!["@odata.etag"] = 'W/"changed"'; });
    const out = await runBulk(api, meta, records, plans, { cancelled: false });
    expect(out.map((o) => o.status)).toEqual(["applied", "failed", "conflict", "applied"]);
    expect(out[1]!.message).toMatch(/403/);
    expect(api.records.get(ids[2]!)!.prio).toBe(2);
  });

  it("does not write records without changes and stops starting new ones when cancelled", async () => {
    const { api, meta, ids } = setup(3);
    const { records, plans } = await prepare(api, meta, ids, [step("prio", "optionset", { value: 2 })]);
    const same = await runBulk(api, meta, records, plans, { cancelled: false });
    expect(same.map((o) => o.status)).toEqual(["unchanged", "unchanged", "unchanged"]);
    expect(api.calls.some((c) => c.startsWith("PATCH"))).toBe(false);
    const { records: r2, plans: p2 } = await prepare(api, meta, ids, [step("prio", "optionset", { value: 1 })]);
    const cancelled = await runBulk(api, meta, r2, p2, { cancelled: true });
    expect(cancelled.every((o) => o.status === "notStarted")).toBe(true);
    expect(api.records.get(ids[0]!)!.prio).toBe(2);
  });

  it("reports a record that could not be read", async () => {
    const { api, meta, ids } = setup(1);
    const records = await loadRecords(api, meta, [ids[0]!, ID(99), "not-a-guid"]);
    expect(records.map((r) => !!r.error)).toEqual([false, true, true]);
    const plans = new Map(records.map((r) => [r.id, r.error ? [] : planRecord(meta, r, [step("prio", "optionset", { value: 1 })])]));
    const out = await runBulk(api, meta, records, plans, { cancelled: false });
    expect(out.map((o) => o.status)).toEqual(["applied", "failed", "failed"]);
  });

  it("undoes a run, but leaves a column that was edited since", async () => {
    const { api, meta, ids } = setup(3);
    const steps = [step("prio", "optionset", { value: 1 }), step("title", "string", { sortOrder: 20, value: "new" })];
    const { records, plans } = await prepare(api, meta, ids, steps);
    const run = await runBulk(api, meta, records, plans, { cancelled: false });
    api.records.get(ids[1]!)!.title = "edited by someone";
    api.records.get(ids[2]!)!.title = "edited too";
    api.records.get(ids[2]!)!.prio = 2;
    const undo = await undoRun(api, meta, run, { cancelled: false });
    expect(undo.map((o) => o.status)).toEqual(["applied", "applied", "conflict"]);
    expect(api.records.get(ids[0]!)).toMatchObject({ title: "r0", prio: 2 });
    expect(api.records.get(ids[1]!)).toMatchObject({ title: "edited by someone", prio: 2 });
    expect(undo[1]!.message).toBe("title");
    expect(api.records.get(ids[2]!)).toMatchObject({ title: "edited too", prio: 2 });
  });

  it("restores a cleared lookup", async () => {
    const api = new FakeApi();
    const meta = makeMeta();
    api.add(ID(1), { title: "a", _customerid_value: ID(9), "_customerid_value@Microsoft.Dynamics.CRM.lookuplogicalname": "account" });
    const { records, plans } = await prepare(api, meta, [ID(1)], [step("customerid", "lookup", { operation: "clear" })]);
    const run = await runBulk(api, meta, records, plans, { cancelled: false });
    expect(api.records.get(ID(1))!["_customerid_value"]).toBeUndefined();
    await undoRun(api, meta, run, { cancelled: false });
    expect(api.records.get(ID(1))!["_customerid_value"]).toBe(ID(9));
  });
});

describe("summarize", () => {
  it("counts records and per-step results", async () => {
    const api = new FakeApi();
    const meta = makeMeta();
    api.add(ID(1), { title: "a", prio: 1 });
    api.add(ID(2), { title: "b", prio: 2 });
    const records = [...(await loadRecords(api, meta, [ID(1), ID(2), ID(3)]))];
    const steps = [step("prio", "optionset", { value: 2 }), step("locked", "string", { sortOrder: 20, value: "x" })];
    const plans = new Map(records.map((r) => [r.id, r.error ? [] : planRecord(meta, r, steps)]));
    const s = summarize(records, plans, steps);
    expect(s).toMatchObject({ records: 3, toChange: 1, nothing: 1, failedToLoad: 1 });
    expect(s.steps[0]).toMatchObject({ column: "prio", apply: 1, noop: 1 });
    expect(s.steps[1]).toMatchObject({ column: "locked", skipped: { readonly: 2 } });
  });
});

describe("CSV", () => {
  it("quotes cells and defuses formulas", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('a;b "c"')).toBe('"a;b ""c"""');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("-5")).toBe("-5");
    expect(csvCell("@x")).toBe("'@x");
    expect(toCsv([["a", "b"], ["1", "2;3"]])).toBe('a;b\r\n1;"2;3"');
    expect(toCsv([["a", "b"], ["1", "2,3"]], ",")).toBe('a,b\r\n1,"2,3"');
  });

  it("writes one row per record and column, with the old and new value and the result", async () => {
    const api = new FakeApi();
    const meta = makeMeta();
    api.add(ID(1), { title: "a", prio: 2 });
    const steps = [step("prio", "optionset", { value: 1 }), step("locked", "string", { sortOrder: 20, value: "x" })];
    const records = await loadRecords(api, meta, [ID(1)]);
    const plans = new Map(records.map((r) => [r.id, planRecord(meta, r, steps)]));
    const out = await runBulk(api, meta, records, plans, { cancelled: false });
    const rows = csvRows(meta, out, (o, item) => (item?.status === "skip" ? "skipped" : o.status));
    expect(rows).toEqual([
      ["a", ID(1), "PRIO", "Low", "High", "applied"],
      ["a", ID(1), "LOCKED", "", "", "skipped"],
    ]);
    expect(csvRows(meta, [{ id: ID(2), name: "", status: "failed", items: [], changes: [], message: "404" }], (o) => o.message ?? "")).toEqual([["", ID(2), "", "", "", "404"]]);
  });

  it("shows option labels, lookup names and multi-select labels", () => {
    const m = makeMeta();
    expect(displayValue(m.columns.get("prio"), 1)).toBe("High");
    expect(displayValue(m.columns.get("tags"), [1, 2])).toBe("A; B");
    expect(displayValue(m.columns.get("customerid"), { entityType: "account", id: "x", name: "Contoso" })).toBe("Contoso");
    expect(displayValue(m.columns.get("title"), null)).toBe("");
  });
});

describe("loadTableMeta", () => {
  it("reads only the needed columns with their limits, and the lookup navigation properties", async () => {
    const answers: Array<[RegExp, unknown]> = [
      [/^EntityDefinitions\(LogicalName='incident'\)\?/, { EntitySetName: "incidents", PrimaryIdAttribute: "incidentid", PrimaryNameAttribute: "title" }],
      [/\/Attributes\?/, { value: [
        { LogicalName: "title", AttributeTypeName: { Value: "StringType" }, DisplayName: { UserLocalizedLabel: { Label: "Title" } }, IsValidForRead: true, IsValidForUpdate: true },
        { LogicalName: "prio", AttributeTypeName: { Value: "PicklistType" }, DisplayName: { UserLocalizedLabel: { Label: "Priority" } }, IsValidForRead: true, IsValidForUpdate: false },
        { LogicalName: "customerid", AttributeTypeName: { Value: "CustomerType" }, DisplayName: { UserLocalizedLabel: { Label: "Customer" } }, IsValidForRead: true, IsValidForUpdate: true },
        { LogicalName: "other", AttributeTypeName: { Value: "StringType" }, IsValidForRead: true },
        { LogicalName: "titlename", AttributeTypeName: { Value: "StringType" }, AttributeOf: "title", IsValidForRead: true },
      ] }],
      [/PicklistAttributeMetadata\?/, { value: [{ LogicalName: "prio", OptionSet: { Options: [{ Value: 1, Label: { UserLocalizedLabel: { Label: "High" } } }] } }] }],
      [/StateAttributeMetadata|StatusAttributeMetadata/, { value: [] }],
      [/StringAttributeMetadata\?/, { value: [{ LogicalName: "title", MaxLength: 100 }, { LogicalName: "other", MaxLength: 5 }] }],
      [/LookupAttributeMetadata\?/, { value: [{ LogicalName: "customerid", Targets: ["account", "contact"] }] }],
      [/ManyToOneRelationships\?/, { value: [{ ReferencingAttribute: "customerid", ReferencedEntity: "account", ReferencingEntityNavigationPropertyName: "customerid_account" }] }],
    ];
    const asked: string[] = [];
    const api: Api = {
      async request(_m, path) {
        asked.push(path);
        const hit = answers.find(([re]) => re.test(path));
        if (!hit) throw new Error(`unexpected ${path}`);
        return { data: hit[1], headers: new Headers() };
      },
    };
    const meta = await loadTableMeta(api, "incident", ["title", "prio", "customerid", "missing"]);
    expect([...meta.columns.keys()].sort()).toEqual(["customerid", "prio", "title"]);
    expect(meta).toMatchObject({ entitySet: "incidents", idAttribute: "incidentid", nameAttribute: "title" });
    expect(meta.columns.get("title")).toMatchObject({ label: "Title", maxLength: 100, canUpdate: true });
    expect(meta.columns.get("prio")).toMatchObject({ canUpdate: false, options: [{ value: 1, text: "High" }] });
    expect(meta.columns.get("customerid")!.targets).toEqual(["account", "contact"]);
    expect(meta.navProps.get("customerid|account")).toBe("customerid_account");
    expect(asked.some((p) => /DateTimeAttributeMetadata|MoneyAttributeMetadata/.test(p))).toBe(false);
  });

  it("refuses unsafe table names", async () => {
    await expect(loadTableMeta({ request: async () => ({ data: {}, headers: new Headers() }) }, "a');drop", [])).rejects.toThrow(/Invalid table name/);
  });

  it("collects the columns a recording touches, including copy sources and calculation inputs", () => {
    const cols = neededColumns([
      step("a", "string", { valueMode: "copy", sourceColumn: "b" }),
      step("c", "datetime", { valueMode: "calculate", calc: { kind: "date", base: { source: "column", column: "d" }, amount: 1, unit: "days" } }),
    ]);
    expect(cols.sort()).toEqual(["a", "b", "c", "d"]);
  });
});

describe("loadRecord", () => {
  it("selects lookups by their value name and keeps the ETag", async () => {
    const api = new FakeApi();
    api.add(ID(1), { title: "x" });
    const meta = makeMeta();
    const rec = await loadRecord(api, meta, ID(1));
    expect(api.calls[0]).toContain("_customerid_value");
    expect(api.calls[0]).toContain("$select=incidentid,title");
    expect(rec).toMatchObject({ id: ID(1), name: "x" });
    expect(rec.etag).toMatch(/^W\//);
  });
});
