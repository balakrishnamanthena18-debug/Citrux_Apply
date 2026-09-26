import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/health/route";

describe("Health Check Endpoint (GET /api/health)", () => {
  it("returns HTTP 200 with pass status, dynamic timestamp, and no secret leakage", async () => {
    const beforeCall = Date.now();
    const response = await GET();
    const afterCall = Date.now();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(response.headers.get("Cache-Control")).toBe("no-store, max-age=0");

    const data = await response.json();

    expect(data.status).toBe("pass");
    expect(data.service).toBe("oos");
    expect(data.phase).toBe("0");

    const timestampMs = new Date(data.timestamp).getTime();
    expect(timestampMs).toBeGreaterThanOrEqual(beforeCall - 1000);
    expect(timestampMs).toBeLessThanOrEqual(afterCall + 1000);

    // Verify zero secret or infrastructure leakage
    expect(data.database).toBeUndefined();
    expect(data.env).toBeUndefined();
    expect(data.secrets).toBeUndefined();
    expect(data.config).toBeUndefined();
  });
});
