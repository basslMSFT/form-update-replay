import { describe, expect, it } from "vitest";
import type { Api, BusinessUnit } from "../src/store";
import { defaultTeams, listBusinessUnits, unitsForScope } from "../src/store";

const unit = (id: string, parentId: string | null): BusinessUnit => ({ id, name: id.toUpperCase(), parentId });

//        root
//       /    \
//     south  north
//     /  \      \
//   s1    s2     n1
const ALL = [unit("root", null), unit("south", "root"), unit("north", "root"), unit("s1", "south"), unit("s2", "south"), unit("n1", "north")];
const ids = (list: BusinessUnit[]): string[] => list.map((u) => u.id).sort();

describe("unitsForScope", () => {
  it("this unit only", () => expect(ids(unitsForScope(ALL, "south", "unit"))).toEqual(["south"]));
  it("this unit and the units below it", () => expect(ids(unitsForScope(ALL, "south", "below"))).toEqual(["s1", "s2", "south"]));
  it("this unit and the units above it", () => expect(ids(unitsForScope(ALL, "s1", "above"))).toEqual(["root", "s1", "south"]));
  it("the whole branch does not include sibling units", () => expect(ids(unitsForScope(ALL, "south", "branch"))).toEqual(["root", "s1", "s2", "south"]));
  it("the root with 'below' is every unit", () => expect(ids(unitsForScope(ALL, "root", "below"))).toHaveLength(6));
  it("the root with 'above' is itself", () => expect(ids(unitsForScope(ALL, "root", "above"))).toEqual(["root"]));
  it("an unknown unit gives nothing", () => expect(unitsForScope(ALL, "nope", "branch")).toEqual([]));
  it("survives a loop in the data", () => {
    const loop = [unit("a", "b"), unit("b", "a")];
    expect(ids(unitsForScope(loop, "a", "branch"))).toEqual(["a", "b"]);
  });
});

describe("business unit queries", () => {
  it("reads units with their parent", async () => {
    const api: Api = {
      request: async () => ({ data: { value: [{ businessunitid: "{ABC}", name: "Root" }, { businessunitid: "DEF", name: "Child", _parentbusinessunitid_value: "{ABC}" }] }, headers: new Headers() }),
    };
    expect(await listBusinessUnits(api)).toEqual([{ id: "abc", name: "Root", parentId: null }, { id: "def", name: "Child", parentId: "abc" }]);
  });

  it("finds default owner teams in batches of 20 units", async () => {
    const paths: string[] = [];
    const api: Api = {
      request: async (_m, path) => {
        paths.push(path);
        return { data: { value: [{ teamid: "T1", name: "Default team" }] }, headers: new Headers() };
      },
    };
    const list = Array.from({ length: 45 }, (_, i) => `u${i}`);
    const teams = await defaultTeams(api, list);
    expect(paths).toHaveLength(3);
    expect(paths[0]).toContain("isdefault eq true and teamtype eq 0");
    expect(teams).toHaveLength(3);
    expect(teams[0]).toEqual({ id: "t1", type: "team", name: "Default team" });
  });
});
