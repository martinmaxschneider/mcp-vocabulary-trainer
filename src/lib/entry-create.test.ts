import { describe, expect, it } from "vitest";
import { isEntryCreated } from "~/lib/entry-create";

describe("isEntryCreated", () => {
  it("narrows created results", () => {
    const created = { created: true as const, entry: { id: "1" } };
    const skipped = {
      created: false as const,
      reason: "similar" as const,
      candidates: [],
    };

    expect(isEntryCreated(created)).toBe(true);
    expect(isEntryCreated(skipped)).toBe(false);
  });
});
