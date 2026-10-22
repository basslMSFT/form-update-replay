import { beforeEach, describe, expect, it } from "vitest";
import type { Api } from "../src/store";
import { stepFromRow, stepToPayload } from "../src/store";
import type { RelatedSpec, Step } from "../src/model";
import { OPTION } from "../src/model";
import type { AttrLike } from "../src/value-codec";
import { plan } from "../src/player";
import { changesFrom, runBulk, summarize, undoRun, planRecord } from "../src/bulk";
import type { BulkColumn, TableMeta } from "../src/bulk-meta";
import { neededColumns } from "../src/bulk-meta";
import {
  capturedSince, clearRelatedCache, createRelated, deleteCreated, existsAlready, newRelated, plainText, relatedColumns, relatedSupport, relatedValid, resolveRelated, snapshotRelated,
} from "../src/related";

const PARENT = "11111111-1111-1111-1111-111111111111";
const ME = "99999999-9999-9999-9999-999999999999";
const OTHER = "88888888-8888-8888-8888-888888888888";

type Row = Record<string, any>;

/** A small in-memory Dataverse for notes and tasks: metadata, create, delete and the filters that related.ts sends. */
class FakeApi implements Api {
  notes = new Map<string, Row>();
  tasks = new Map<string, Row>();
  calls: string[] = [];
  hasNotes = true;
  hasActivities = true;
  failCreate = false;
  private n = 0;

  private matches(row: Row, filter: string): boolean {
    return filter.split(" and ").every((clause) => {
      const m = /^(\w+) eq (.+)$/.exec(clause.trim());
      if (!m) throw new Error(`Unsupported filter clause: ${clause}`);
      const [, column, raw] = m;
      const want = raw === "null" ? null : raw!.startsWith("'") ? raw!.slice(1, -1).replace(/''/g, "'") : /^\d+$/.test(raw!) ? Number(raw) : raw;
      const have = row[column!] ?? null;
      return have === want;
    });
  }

  async request(method: string, path: string, body?: any) {
    this.calls.push(`${method} ${path}`);
    const ok = (data: unknown) => ({ data, headers: new Headers() });
    let m = /^EntityDefinitions\(LogicalName='(\w+)'\)\?/.exec(path);
    if (m) return ok({ EntitySetName: m[1] === "incident" ? "incidents" : `${m[1]}s`, HasNotes: this.hasNotes, HasActivities: this.hasActivities });
    m = /^EntityDefinitions\(LogicalName='(annotation|task)'\)\/ManyToOneRelationships/.exec(path);
    if (m) return ok({ value: [{ ReferencingEntityNavigationPropertyName: m[1] === "annotation" ? "objectid_incident" : "regardingobjectid_incident_task" }] });
    m = /^(annotations|tasks)\?(.*)$/.exec(path);
    if (m && method === "GET") {
      const store = m[1] === "annotations" ? this.notes : this.tasks;
      const filter = decodeURIComponent(/\$filter=([^&]*)/.exec(m[2]!)![1]!);
      return ok({ value: [...store.values()].filter((r) => this.matches(r, filter)) });
    }
    if (method === "POST" && (path === "annotations" || path === "tasks")) {
      if (this.failCreate) throw new Error("403: Principal user is missing create privilege");
      const note = path === "annotations";
      const id = `00000000-0000-0000-0000-${String(++this.n).padStart(12, "0")}`;
      const row: Row = { [note ? "annotationid" : "activityid"]: id, _createdby_value: ME, statecode: 0 };
      for (const [k, v] of Object.entries(body)) {
        if (k.endsWith("@odata.bind")) row[note ? "_objectid_value" : "_regardingobjectid_value"] = /\(([0-9a-f-]{36})\)/.exec(v as string)![1];
        else row[k] = v;
      }
      (note ? this.notes : this.tasks).set(id, row);
      return ok(row);
    }
    m = /^(annotations|tasks)\(([0-9a-f-]{36})\)$/.exec(path);
    if (m && method === "DELETE") {
      const store = m[1] === "annotations" ? this.notes : this.tasks;
      if (!store.delete(m[2]!)) throw new Error("404: not found");
      return ok(null);
    }
    throw new Error(`404: ${method} ${path}`);
  }
}

beforeEach(() => clearRelatedCache());

const ctx = { now: new Date(2026, 9, 22, 12, 0, 0), userName: "Bas", text: (c: string) => ({ title: "Printer offline" })[c] ?? "" };

describe("resolveRelated", () => {
  it("fills placeholders in a note", () => {
    const r = resolveRelated({ kind: "note", subject: "Call {{user}}", text: "About {{title}} on {{today}}" }, ctx);
    expect(r).toEqual({ kind: "note", subject: "Call Bas", text: `About Printer offline on ${ctx.now.toLocaleDateString(undefined)}` });
  });

  it("turns a due offset into a local date", () => {
    const r = resolveRelated({ kind: "task", subject: "Follow up", description: "", dueInDays: 7, priority: 2 }, ctx);
    expect(r).toMatchObject({ kind: "task", dueDate: "2026-10-29", priority: 2 });
    expect(resolveRelated({ kind: "task", subject: "x", description: "", dueInDays: null, priority: 1 }, ctx)).toMatchObject({ dueDate: null });
  });

  it("cuts the subject at the column limit", () => {
    const r = resolveRelated({ kind: "task", subject: "a".repeat(300), description: "", dueInDays: null, priority: 1 }, ctx);
    expect(r.subject).toHaveLength(200);
  });
});

describe("relatedColumns and relatedValid", () => {
  it("lists only record columns, not the built-in placeholders", () => {
    expect(relatedColumns({ kind: "note", subject: "{{today}} {{title}}", text: "{{user}} {{customerid}}" }).sort()).toEqual(["customerid", "title"]);
  });

  it("needs a subject for a task and a subject or text for a note", () => {
    expect(relatedValid(newRelated("note"))).toBe(false);
    expect(relatedValid({ kind: "note", subject: "", text: "hi" })).toBe(true);
    expect(relatedValid({ kind: "task", subject: "", description: "hi", dueInDays: 1, priority: 1 })).toBe(false);
    expect(relatedValid({ kind: "task", subject: "Call", description: "", dueInDays: null, priority: 1 })).toBe(true);
    expect(relatedValid(undefined)).toBe(false);
  });
});

describe("step storage", () => {
  const spec: RelatedSpec = { kind: "task", subject: "Call back", description: "Ask about {{title}}", dueInDays: 3, priority: 2 };
  const step: Step = { sortOrder: 20, operation: "addRelated", valueMode: "fixed", column: "task", columnType: "related", related: spec };

  it("writes the spec as JSON with its own operation value", () => {
    const p = stepToPayload(step);
    expect(p.bassllab_operation).toBe(OPTION.operation.addRelated);
    expect(p.bassllab_columnlogicalname).toBe("task");
    expect(JSON.parse(p.bassllab_value as string)).toEqual(spec);
    expect(p.bassllab_sourcecolumnlogicalname).toBeNull();
  });

  it("reads it back, and tolerates damaged content", () => {
    const row = { ...stepToPayload(step) };
    expect(stepFromRow(row)).toEqual(step);
    const bad = stepFromRow({ ...row, bassllab_value: "{oops" });
    expect(bad.operation).toBe("addRelated");
    expect(bad.related).toBeUndefined();
  });

  it("keeps older steps working", () => {
    const set = stepFromRow({ bassllab_operation: OPTION.operation.set, bassllab_valuemode: OPTION.valueMode.fixed, bassllab_columnlogicalname: "title", bassllab_columntype: "string", bassllab_sortorder: 10, bassllab_value: '"x"' });
    expect(set).toMatchObject({ operation: "set", column: "title", value: "x" });
  });
});

function formAttr(name: string, value: string | null): AttrLike {
  const control = { getVisible: () => true, getDisabled: () => false, getLabel: () => name, getParent: () => null };
  return {
    getName: () => name, getAttributeType: () => "string", getValue: () => value, setValue: () => undefined, fireOnChange: () => undefined,
    addOnChange: () => undefined, removeOnChange: () => undefined, controls: { get: () => [control] },
  } as unknown as AttrLike;
}

describe("plan with notes and tasks", () => {
  const form = { entityName: "incident", attributes: [formAttr("title", "Printer offline")] };
  const note: Step = { sortOrder: 10, operation: "addRelated", valueMode: "fixed", column: "annotation", columnType: "related", related: { kind: "note", subject: "Seen", text: "About {{title}}" } };

  it("plans a note on a saved record", () => {
    const [item] = plan(form, [note], { record: { saved: true } });
    expect(item).toMatchObject({ status: "apply", related: { kind: "note", subject: "Seen", text: "About Printer offline" } });
  });

  it("skips on an unsaved record", () => {
    expect(plan(form, [note], { record: { saved: false } })[0]).toMatchObject({ status: "skip", reason: "recordUnsaved" });
  });

  it("skips when the table cannot have notes", () => {
    expect(plan(form, [note], { record: { saved: true, supports: { note: false, task: true } } })[0]).toMatchObject({ status: "skip", reason: "relatedUnsupported" });
  });

  it("skips when a placeholder column is not on the form, or the step is empty or damaged", () => {
    const missing: Step = { ...note, related: { kind: "note", subject: "{{nope}}", text: "" } };
    expect(plan(form, [missing])[0]).toMatchObject({ status: "skip", reason: "sourceMissing" });
    const empty: Step = { ...note, related: { kind: "note", subject: "", text: "" } };
    expect(plan(form, [empty])[0]).toMatchObject({ status: "skip", reason: "relatedInvalid" });
    expect(plan(form, [{ ...note, related: undefined }])[0]).toMatchObject({ status: "skip", reason: "relatedInvalid" });
  });

  it("never turns a note into a column change", () => {
    expect(changesFrom(plan(form, [note]))).toEqual([]);
  });
});

describe("createRelated", () => {
  it("creates a note linked to the record", async () => {
    const api = new FakeApi();
    const res = await createRelated(api, "incident", PARENT, { kind: "note", subject: "Hi", text: "Body" });
    expect(res.status).toBe("created");
    const post = api.calls.find((c) => c.startsWith("POST"))!;
    expect(post).toBe("POST annotations");
    const [row] = [...api.notes.values()];
    expect(row).toMatchObject({ subject: "Hi", notetext: "Body", _objectid_value: PARENT });
  });

  it("creates a task with due date and priority", async () => {
    const api = new FakeApi();
    await createRelated(api, "incident", PARENT, { kind: "task", subject: "Call", description: "", dueDate: "2026-10-29", priority: 2 });
    expect([...api.tasks.values()][0]).toMatchObject({ subject: "Call", scheduledend: "2026-10-29", prioritycode: 2, _regardingobjectid_value: PARENT });
  });

  it("does not create the same note twice", async () => {
    const api = new FakeApi();
    const r = { kind: "note", subject: "Hi", text: "Body" } as const;
    expect((await createRelated(api, "incident", PARENT, r)).status).toBe("created");
    expect((await createRelated(api, "incident", PARENT, r)).status).toBe("exists");
    expect(api.notes.size).toBe(1);
  });

  it("treats only an open task as a duplicate", async () => {
    const api = new FakeApi();
    const r = { kind: "task", subject: "Call", description: "", dueDate: null, priority: 1 } as const;
    await createRelated(api, "incident", PARENT, r);
    [...api.tasks.values()][0]!.statecode = 1;
    expect(await existsAlready(api, "task", PARENT, r)).toBe(false);
    expect((await createRelated(api, "incident", PARENT, r)).status).toBe("created");
  });

  it("escapes quotes in the duplicate check", async () => {
    const api = new FakeApi();
    const r = { kind: "note", subject: "It's done", text: "" } as const;
    await createRelated(api, "incident", PARENT, r);
    expect((await createRelated(api, "incident", PARENT, r)).status).toBe("exists");
  });

  it("refuses a table without notes", async () => {
    const api = new FakeApi();
    api.hasNotes = false;
    await expect(createRelated(api, "incident", PARENT, { kind: "note", subject: "x", text: "" })).rejects.toThrow(/cannot have notes/);
    expect(await relatedSupport(api, "incident")).toEqual({ note: false, task: true });
  });

  it("passes server errors on", async () => {
    const api = new FakeApi();
    api.failCreate = true;
    await expect(createRelated(api, "incident", PARENT, { kind: "note", subject: "x", text: "" })).rejects.toThrow(/403/);
  });
});

describe("deleteCreated", () => {
  it("deletes exactly the given records and counts a missing one as removed", async () => {
    const api = new FakeApi();
    const a = await createRelated(api, "incident", PARENT, { kind: "note", subject: "a", text: "" });
    await createRelated(api, "incident", PARENT, { kind: "note", subject: "b", text: "" });
    if (a.status !== "created") throw new Error("expected created");
    const res = await deleteCreated(api, [a.created, { set: "annotations", id: "00000000-0000-0000-0000-00000000ffff" }]);
    expect(res).toEqual({ removed: 2, failed: [] });
    expect([...api.notes.values()].map((n) => n.subject)).toEqual(["b"]);
  });
});

describe("capture while recording", () => {
  it("returns only what the user added after the snapshot, without attachments or other people's notes", async () => {
    const api = new FakeApi();
    api.notes.set("n-old", { annotationid: "n-old", _objectid_value: PARENT, _createdby_value: ME, subject: "old" });
    api.tasks.set("t-old", { activityid: "t-old", _regardingobjectid_value: PARENT, _createdby_value: ME, subject: "old" });
    const before = await snapshotRelated(api, PARENT);
    api.notes.set("n1", { annotationid: "n1", _objectid_value: PARENT, _createdby_value: ME, subject: "Hi", notetext: "<p>Line 1</p><p>Line &amp; 2</p>", isdocument: false });
    api.notes.set("n2", { annotationid: "n2", _objectid_value: PARENT, _createdby_value: ME, subject: "file", isdocument: true });
    api.notes.set("n3", { annotationid: "n3", _objectid_value: PARENT, _createdby_value: OTHER, subject: "theirs" });
    const due = new Date();
    due.setDate(due.getDate() + 5);
    api.tasks.set("t1", { activityid: "t1", _regardingobjectid_value: PARENT, _createdby_value: ME, subject: "Call", description: "x", scheduledend: `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}T00:00:00Z`, prioritycode: 2 });
    const added = await capturedSince(api, PARENT, before, ME);
    expect(added).toEqual([
      { kind: "note", subject: "Hi", text: "Line 1\nLine & 2" },
      { kind: "task", subject: "Call", description: "x", dueInDays: 5, priority: 2 },
    ]);
  });

  it("returns nothing for a record that was never saved", async () => {
    const api = new FakeApi();
    expect(await capturedSince(api, "", { notes: new Set(), tasks: new Set() }, ME)).toEqual([]);
    expect((await snapshotRelated(api, "")).notes.size).toBe(0);
    expect(api.calls).toEqual([]);
  });
});

describe("plainText", () => {
  it("leaves plain text alone and strips markup from html", () => {
    expect(plainText("a < b and c > d")).toBe("a < b and c > d");
    expect(plainText("<div>One<br>Two</div><p>&lt;x&gt;</p>")).toBe("One\nTwo\n<x>");
  });
});

// ---- Grid replay ----

const col = (name: string, type: string): BulkColumn => ({ name, label: name.toUpperCase(), type, format: null, behavior: null, canUpdate: true });
const meta: TableMeta = {
  table: "incident", entitySet: "incidents", idAttribute: "incidentid", nameAttribute: "title",
  columns: new Map([["title", col("title", "string")]]), navProps: new Map(), entitySets: new Map(),
};
const rec = (id: string, title: string) => ({ id, name: title, etag: "W/\"1\"", raw: { incidentid: id, title } });
const A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("grid replay with notes and tasks", () => {
  const steps: Step[] = [
    { sortOrder: 10, operation: "addRelated", valueMode: "fixed", column: "annotation", columnType: "related", related: { kind: "note", subject: "Reviewed", text: "{{title}}" } },
    { sortOrder: 20, operation: "addRelated", valueMode: "fixed", column: "task", columnType: "related", related: { kind: "task", subject: "Follow up", description: "", dueInDays: 2, priority: 1 } },
  ];

  const plansFor = (records: ReturnType<typeof rec>[], options = {}) => new Map(records.map((r) => [r.id, planRecord(meta, r, steps, { now: new Date(2026, 9, 22), userName: "Bas", ...options })]));

  it("needs no table column for these steps except the ones placeholders read", () => {
    expect(neededColumns(steps)).toEqual(["title"]);
    expect(neededColumns([steps[1]!])).toEqual([]);
  });

  it("summarizes each note or task step on its own row", () => {
    const records = [rec(A, "One"), rec(B, "Two")];
    const s = summarize(records, plansFor(records), steps);
    expect(s.steps.map((r) => [r.related, r.apply])).toEqual([["note", 2], ["task", 2]]);
    expect(s.toChange).toBe(2);
  });

  it("skips records of a table that cannot have notes", () => {
    const records = [rec(A, "One")];
    const s = summarize(records, plansFor(records, { record: { saved: true, supports: { note: false, task: true } } }), steps);
    expect(s.steps[0]!.skipped).toEqual({ relatedUnsupported: 1 });
    expect(s.steps[1]!.apply).toBe(1);
  });

  it("creates a note and a task per record, skips existing ones, and undo removes only what was created", async () => {
    const api = new FakeApi();
    const records = [rec(A, "One"), rec(B, "Two")];
    // record A already has the identical note
    await createRelated(api, "incident", A, { kind: "note", subject: "Reviewed", text: "One" });
    const before = api.notes.size;

    const out = await runBulk(api, meta, records, plansFor(records), { cancelled: false });
    expect(out.map((o) => o.status)).toEqual(["applied", "applied"]);
    expect(out[0]!.related!.map((r) => r.result)).toEqual(["exists", "created"]);
    expect(out[1]!.related!.map((r) => r.result)).toEqual(["created", "created"]);
    expect(api.notes.size).toBe(before + 1);
    expect(api.tasks.size).toBe(2);

    const undo = await undoRun(api, meta, out, { cancelled: false });
    expect(undo.map((o) => o.status)).toEqual(["applied", "applied"]);
    expect(api.notes.size).toBe(before);
    expect(api.tasks.size).toBe(0);
    expect([...api.notes.values()][0]!._objectid_value).toBe(A);
  });

  it("reports a record as unchanged when everything was there already, and failed when nothing could be created", async () => {
    const api = new FakeApi();
    const records = [rec(A, "One")];
    await runBulk(api, meta, records, plansFor(records), { cancelled: false });
    const again = await runBulk(api, meta, records, plansFor(records), { cancelled: false });
    expect(again[0]!.status).toBe("unchanged");

    const denied = new FakeApi();
    denied.failCreate = true;
    const out = await runBulk(denied, meta, [rec(B, "Two")], plansFor([rec(B, "Two")]), { cancelled: false });
    expect(out[0]!.status).toBe("failed");
    expect(out[0]!.message).toMatch(/403/);
  });
});
