import { describe, expect, it } from "vitest";

import { initial } from "../src/lib/initial";

describe("initial", () => {
  it("takes the first letter, uppercased, for the avatar", () => {
    expect(initial("Олена")).toBe("О");
    expect(initial("bogdan")).toBe("B");
  });

  it("skips leading whitespace", () => {
    expect(initial("  Богдан")).toBe("Б");
  });

  it("is empty for an empty or blank name", () => {
    expect(initial("")).toBe("");
    expect(initial("   ")).toBe("");
  });
});
