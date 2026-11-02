import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Step } from "../src/model";
import { RecordingAccess, RecordingRow } from "../src/store";
import { setLang } from "../src/i18n";
import { RecordingCommands } from "../src/ui/Hub";
import { StepsEditor } from "../src/ui/StepsEditor";

const row: RecordingRow = { id: "recording", name: "Shared recording", description: "", table: "incident", stepCount: 1, ownerId: "owner", ownerType: "systemuser", ownerName: "Owner", modifiedOn: "" };
const read: RecordingAccess = { canWrite: false, canShare: false, canAssign: false, canDelete: false };
const edit: RecordingAccess = { ...read, canWrite: true };
const full: RecordingAccess = { canWrite: true, canShare: true, canAssign: true, canDelete: true };

function commands(picked: RecordingRow[], rights: RecordingAccess[]): Map<string, boolean> {
  setLang("en");
  const html = renderToStaticMarkup(createElement(RecordingCommands, { picked, rights, onOpen: () => undefined, onAction: () => undefined }));
  return new Map([...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map((match) => [
    match[2]!.replace(/<[^>]*>/g, ""),
    /\bdisabled=""/.test(match[1]!),
  ]));
}

describe("recording grid access", () => {
  it("allows opening a read-only recording but disables every mutating command", () => {
    expect(Object.fromEntries(commands([row], [read]))).toEqual({ Open: false, Rename: true, Share: true, "Assign to team": true, Delete: true });
  });

  it("allows renaming an editable share without granting sharing, assignment or deletion", () => {
    expect(Object.fromEntries(commands([row], [edit]))).toEqual({ Open: false, Rename: false, Share: true, "Assign to team": true, Delete: true });
  });

  it("preserves all commands for users with the corresponding rights", () => {
    expect([...commands([row], [full]).values()]).toEqual([false, false, false, false, false]);
  });

  it("disables mutating commands until all selected access checks succeed", () => {
    expect(Object.fromEntries(commands([row], []))).toEqual({ Open: false, Rename: true, Share: true, "Assign to team": true, Delete: true });
    expect([...commands([row, { ...row, id: "second" }], [full]).values()]).toEqual([true, true, true, true, true]);
  });

  it("does not partially act on a mixed read-only and editable selection", () => {
    expect([...commands([row, { ...row, id: "second" }], [full, read]).values()]).toEqual([true, true, true, true, true]);
  });

  it("enables bulk commands only when every selected row allows them", () => {
    expect(Object.fromEntries(commands([row, { ...row, id: "second" }], [full, full]))).toEqual({ Open: true, Rename: true, Share: false, "Assign to team": false, Delete: false });
    expect([...commands([], []).values()]).toEqual([true, true, true, true, true]);
  });
});

describe("read-only step editors", () => {
  const steps: Step[] = [
    { sortOrder: 10, column: "title", columnType: "string", operation: "set", valueMode: "fixed", value: "Title" },
    { sortOrder: 20, column: "description", columnType: "memo", operation: "set", valueMode: "prompt", promptText: "Description?" },
    { sortOrder: 30, column: "title", columnType: "string", operation: "set", valueMode: "copy", sourceColumn: "description" },
    { sortOrder: 40, column: "title", columnType: "string", operation: "set", valueMode: "calculate", calc: { kind: "text", mode: "replace", text: "Calculated", separator: "none" } },
    { sortOrder: 50, column: "annotation", columnType: "related", operation: "addRelated", valueMode: "fixed", related: { kind: "note", subject: "Note", text: "Note content" } },
    { sortOrder: 60, column: "task", columnType: "related", operation: "addRelated", valueMode: "fixed", related: { kind: "task", subject: "Task", description: "Follow up", dueInDays: 2, priority: 1 } },
  ];

  it("disables the entire editor including nested calculations, notes, tasks and reorder/add/remove buttons", () => {
    const html = renderToStaticMarkup(createElement(StepsEditor, { steps, onChange: () => undefined, columns: [], readOnly: true }));
    expect(html).toMatch(/^<fieldset\b[^>]*\bdisabled=""/);
    expect(html).toMatch(/<\/fieldset>$/);
    for (const label of ["Value source", "Question to ask", "Source column", "What to do with the text", "Note content", "Follow up", "Due in (days)", "Priority", "Move up", "Move down", "Remove change", "Add note", "Add task"]) {
      expect(html).toContain(label);
    }
    // No controls are outside the disabled native fieldset, including those in nested editors.
    const content = html.slice(html.indexOf(">") + 1, html.lastIndexOf("</fieldset>"));
    expect(content.match(/<(input|select|textarea|button)\b/g)!.length).toBeGreaterThan(20);
  });

  it("keeps the existing review editor editable by default", () => {
    const html = renderToStaticMarkup(createElement(StepsEditor, { steps, onChange: () => undefined, columns: [] }));
    expect(html.match(/^<fieldset\b[^>]*>/)![0]).not.toContain("disabled");
  });
});
