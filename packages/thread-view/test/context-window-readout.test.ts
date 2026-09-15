import { describe, expect, it } from "vitest";
import {
  formatContextWindowReadout,
  formatContextWindowTokens,
} from "../src/index.js";

describe("context window readout", () => {
  it("formats used over the model window compactly", () => {
    expect(
      formatContextWindowReadout({
        usedTokens: 370_000,
        modelContextWindow: 1_000_000,
        estimated: false,
      }),
    ).toBe("370k/1m");
  });

  it("keeps small counts readable", () => {
    expect(
      formatContextWindowReadout({
        usedTokens: 940,
        modelContextWindow: 200_000,
        estimated: true,
      }),
    ).toBe("940/200k");
  });

  it("rounds to whole units and never reports a negative count", () => {
    expect(formatContextWindowTokens(1_512_000)).toBe("2m");
    expect(formatContextWindowTokens(-5)).toBe("0");
  });
});
