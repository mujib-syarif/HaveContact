export async function readJsonObject(request: Request, maxBytes: number): Promise<{data?: Record<string, unknown>; error?: string}> {
  if (!request.body) return { error: "Request body is required" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { error: "Request body too large" };
      }
      chunks.push(value);
    }
  } catch {
    return { error: "Unable to read request body" };
  }
  try {
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { error: "JSON body must be an object" };
    }
    return { data: parsed as Record<string, unknown> };
  } catch {
    return { error: "Invalid JSON" };
  }
}
