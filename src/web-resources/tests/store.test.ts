import { describe, expect, it } from "vitest";
import { Api, Identity, RecordingRow, classify, getShares, listRecordings, recordingToPayload, replaceSteps, searchPrincipals, stepFromRow, stepToPayload } from "../src/store";
import { OPTION, Step } from "../src/model";

const me = "11111111-1111-1111-1111-111111111111";
const myTeam = "22222222-2222-2222-2222-222222222222";
const who: Identity = { userId: me, teamIds: [myTeam], isAdmin: false };

const row = (over: Partial<RecordingRow>): RecordingRow => ({
  id: "a", name: "n", description: "", table: "incident", stepCount: 1, ownerId: "x", ownerType: "systemuser", ownerName: "X", modifiedOn: "", ...over,
});

describe("step mapping", () => {
  it("round-trips a lookup step through the table columns", () => {
    const step: Step = { sortOrder: 10, operation: "set", valueMode: "fixed", column: "productid", columnType: "lookup", value: { entityType: "product", id: "abc", name: "P" } };
    const payload = stepToPayload(step) as Record<string, unknown>;
    expect(payload.bassllab_operation).toBe(OPTION.operation.set);
    expect(payload.bassllab_value).toBe('{"entityType":"product","id":"abc","name":"P"}');
    expect(stepFromRow(payload)).toEqual(step);
  });

  it("keeps clear and prompt steps free of stored values", () => {
    const clear = stepToPayload({ sortOrder: 10, operation: "clear", valueMode: "fixed", column: "title", columnType: "string" }) as Record<string, unknown>;
    expect(clear.bassllab_value).toBeNull();
    const prompt = stepFromRow(stepToPayload({ sortOrder: 20, operation: "set", valueMode: "prompt", column: "title", columnType: "string", promptText: "Which title?" }));
    expect(prompt).toMatchObject({ valueMode: "prompt", promptText: "Which title?" });
    expect(prompt).not.toHaveProperty("value");
  });

  it("builds a deep insert payload with the steps under the relationship name", () => {
    const p = recordingToPayload({ name: "R", table: "incident", steps: [{ sortOrder: 10, operation: "set", valueMode: "fixed", column: "title", columnType: "string", value: "x" }] });
    expect(p.bassllab_tablelogicalname).toBe("incident");
    expect(Array.isArray(p.bassllab_updaterecording_updaterecordingstep)).toBe(true);
  });
});

describe("sharing", () => {
  const rec = (id: string, owner: string) => ({ bassllab_updaterecordingid: id, bassllab_name: id, _ownerid_value: owner, "_ownerid_value@Microsoft.Dynamics.CRM.lookuplogicalname": "systemuser" });
  const poa = [
    { objectid: "a", principalid: "u1", principaltypecode: "systemuser", accessrightsmask: 1 },
    { objectid: "a", principalid: "t1", principaltypecode: "team", accessrightsmask: 3 },
    { objectid: "c", principalid: me, principaltypecode: "systemuser", accessrightsmask: 1 },
  ];
  const api: Api = {
    async request(_m, path) {
      let data: { value: unknown[] };
      if (path.startsWith("principalobjectaccessset")) data = { value: path.includes("objectid eq a") ? poa.filter((p) => p.objectid === "a") : poa };
      else if (path.startsWith("systemusers")) data = { value: [{ systemuserid: "u1", fullname: "Alex" }] };
      else if (path.startsWith("teams")) data = { value: [{ teamid: "t1", name: "Support" }] };
      else data = { value: [rec("a", me), rec("b", me), rec("c", "other")] };
      return { data, headers: { get: () => null } };
    },
  };

  it("shows how many users and teams each recording is shared with", async () => {
    const rows = await listRecordings(api, who, "all");
    expect(rows.map((r) => [r.id, r.sharedCount])).toEqual([["a", 2], ["b", 0], ["c", 1]]);
  });

  it("lists the recordings I own and have shared", async () => {
    expect((await listRecordings(api, who, "sharedby")).map((r) => r.id)).toEqual(["a"]);
  });

  it("names the principals and tells read from write access", async () => {
    const shares = await getShares(api, "a", me);
    expect(shares.map((s) => [s.principal.name, s.canWrite])).toEqual([["Alex", false], ["Support", true]]);
  });

  it("ignores a revoked share that is still stored with no access right", async () => {
    poa.push({ objectid: "a", principalid: "t2", principaltypecode: "team", accessrightsmask: 0 });
    try {
      expect((await listRecordings(api, who, "all")).find((r) => r.id === "a")!.sharedCount).toBe(2);
      expect((await getShares(api, "a", me)).map((s) => s.principal.id)).toEqual(["u1", "t1"]);
    } finally {
      poa.pop();
    }
  });

  it("leaves the count empty when sharing information cannot be read", async () => {
    const broken: Api = { async request(_m, path) { if (path.startsWith("principalobjectaccessset")) throw new Error("403"); return { data: { value: [rec("a", me)] }, headers: { get: () => null } }; } };
    expect((await listRecordings(broken, who, "all"))[0]!.sharedCount).toBeUndefined();
  });
});

describe("tab placement", () => {
  it("separates own, team and directly shared recordings", () => {
    expect(classify(row({ ownerId: me }), who, new Map())).toBe("mine");
    expect(classify(row({ ownerId: myTeam, ownerType: "team" }), who, new Map())).toBe("team");
    expect(classify(row({ id: "r1" }), who, new Map([["r1", new Set([myTeam])]]))).toBe("team");
    expect(classify(row({ id: "r2" }), who, new Map([["r2", new Set([me])]]))).toBe("shared");
  });

  it("lists only the requested scope", async () => {
    const records = [
      { bassllab_updaterecordingid: "a", bassllab_name: "mine", _ownerid_value: me, "_ownerid_value@Microsoft.Dynamics.CRM.lookuplogicalname": "systemuser" },
      { bassllab_updaterecordingid: "b", bassllab_name: "theirs", _ownerid_value: "someone-else", "_ownerid_value@Microsoft.Dynamics.CRM.lookuplogicalname": "systemuser" },
    ];
    const api: Api = {
      async request(_m, path) {
        const data = path.startsWith("principalobjectaccessset")
          ? { value: [{ objectid: "b", principalid: me }] }
          : { value: records };
        return { data, headers: { get: () => null } };
      },
    };
    expect((await listRecordings(api, who, "mine")).map((r) => r.name)).toEqual(["mine"]);
    expect((await listRecordings(api, who, "shared")).map((r) => r.name)).toEqual(["theirs"]);
    expect((await listRecordings(api, who, "all")).length).toBe(2);
  });
});

describe("safe requests", () => {
  const ok = (value: unknown[]) => ({ data: { value }, headers: { get: () => null } });

  it("URL-encodes the search text so it cannot add query options", async () => {
    const paths: string[] = [];
    const api: Api = { async request(_m, path) { paths.push(path); return ok([]); } };
    await searchPrincipals(api, "a') or true&$top=5000#", false);
    for (const p of paths) {
      expect(p).not.toContain("&$top=5000");
      expect(p).toContain("%26%24top%3D5000");
    }
  });

  it("keeps the old steps when creating the new ones fails", async () => {
    const calls: string[] = [];
    let posts = 0;
    const api: Api = {
      async request(method, path) {
        calls.push(`${method} ${path.split("?")[0]}`);
        if (method === "GET") return ok([{ bassllab_updaterecordingstepid: "old1" }]);
        if (method === "POST") {
          posts++;
          if (posts === 2) throw new Error("boom");
          return { data: { bassllab_updaterecordingstepid: `new${posts}` }, headers: { get: () => null } };
        }
        return { data: null, headers: { get: () => null } };
      },
    };
    const step = (n: number): Step => ({ sortOrder: n, operation: "set", valueMode: "fixed", column: "title", columnType: "string", value: "x" });
    await expect(replaceSteps(api, "rec", [step(10), step(20)])).rejects.toThrow("boom");
    expect(calls).toContain("DELETE bassllab_updaterecordingsteps(new1)");
    expect(calls).not.toContain("DELETE bassllab_updaterecordingsteps(old1)");
  });

  it("removes the old steps only after the new ones exist", async () => {
    const calls: string[] = [];
    const api: Api = {
      async request(method, path) {
        calls.push(`${method} ${path.split("?")[0]}`);
        if (method === "GET") return ok([{ bassllab_updaterecordingstepid: "old1" }]);
        if (method === "POST") return { data: { bassllab_updaterecordingstepid: "new1" }, headers: { get: () => null } };
        return { data: null, headers: { get: () => null } };
      },
    };
    await replaceSteps(api, "rec", [{ sortOrder: 10, operation: "set", valueMode: "fixed", column: "title", columnType: "string", value: "x" }]);
    expect(calls.indexOf("POST bassllab_updaterecordingsteps")).toBeLessThan(calls.indexOf("DELETE bassllab_updaterecordingsteps(old1)"));
  });
});