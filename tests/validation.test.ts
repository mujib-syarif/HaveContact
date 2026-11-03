import { describe, expect, it } from "vitest";
import { hasUnsupportedControlCharacters } from "../worker/validation";

describe("report description validation", () => {
  it("accepts ordinary text and line breaks", () => {
    expect(hasUnsupportedControlCharacters("Repeated calls\nNo voicemail")).toBe(false);
  });

  it("rejects null bytes and non-whitespace control characters", () => {
    expect(hasUnsupportedControlCharacters("spam\u0000call")).toBe(true);
    expect(hasUnsupportedControlCharacters("spam\u0007call")).toBe(true);
    expect(hasUnsupportedControlCharacters("spam\u001Fcall")).toBe(true);
  });

  it("allows tab, line feed, and carriage return", () => {
    expect(hasUnsupportedControlCharacters("one\ttwo\nthree\rfour")).toBe(false);
  });
});
