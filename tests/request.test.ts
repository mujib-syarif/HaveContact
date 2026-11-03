import { describe, expect, it } from "vitest";
import { readJsonObject } from "../worker/request";

describe("readJsonObject", () => {
  it("parses a JSON object", async () => {
    const request = new Request("https://example.test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approved" })
    });
    await expect(readJsonObject(request, 100)).resolves.toEqual({
      data: { action: "approved" }
    });
  });

  it("rejects malformed JSON", async () => {
    const request = new Request("https://example.test", {
      method: "POST",
      body: "{not-json"
    });
    await expect(readJsonObject(request, 100)).resolves.toEqual({
      error: "Invalid JSON"
    });
  });

  it("rejects arrays and primitive JSON values", async () => {
    for (const body of ["[]", "null", "42", '"text"']) {
      const request = new Request("https://example.test", { method: "POST", body });
      await expect(readJsonObject(request, 100)).resolves.toEqual({
        error: "JSON body must be an object"
      });
    }
  });

  it("rejects a body larger than the configured byte limit", async () => {
    const request = new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({ description: "x".repeat(100) })
    });
    await expect(readJsonObject(request, 20)).resolves.toEqual({
      error: "Request body too large"
    });
  });

  it("rejects requests without a body", async () => {
    const request = new Request("https://example.test", { method: "POST" });
    await expect(readJsonObject(request, 100)).resolves.toEqual({
      error: "Request body is required"
    });
  });

  it("accepts a body exactly at the byte limit", async () => {
    const body = '{"ok":true}';
    const request = new Request("https://example.test", { method: "POST", body });
    await expect(readJsonObject(request, new TextEncoder().encode(body).byteLength)).resolves.toEqual({
      data: { ok: true }
    });
  });
});
