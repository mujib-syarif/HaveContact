import { describe, expect, it } from "vitest";
import { getPhoneMetadata, normalizePhone } from "../shared/phone";

describe("normalizePhone", () => {
  it("normalizes Indonesian local mobile numbers", () => {
    expect(normalizePhone("0812 3456 7890")).toBe("+6281234567890");
  });

  it("accepts E.164 Indonesian numbers", () => {
    expect(normalizePhone("+6281234567890")).toBe("+6281234567890");
  });

  it("rejects malformed or unsupported numbers", () => {
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone("not a phone")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});

describe("getPhoneMetadata", () => {
  it("returns numbering-plan metadata without subscriber identity", () => {
    const metadata = getPhoneMetadata("+6281234567890");
    expect(metadata?.country).toBe("ID");
    expect(metadata?.countryCallingCode).toBe("62");
    expect(metadata?.valid).toBe(true);
    expect(metadata).not.toHaveProperty("name");
  });
});
