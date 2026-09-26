import { describe, it, expect, vi, beforeEach } from "vitest";
import { withRlsContext } from "@/lib/db/rls";
import { prisma } from "@/lib/db/prisma";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

describe("RLS Transactional Identity Context Execution (tests/integration/rls-execution.test.ts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets transaction-local identity via parameterized SQL inside withRlsContext", async () => {
    const mockTx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: "user-uuid-1" }),
      },
    };

    vi.mocked(prisma.$transaction).mockImplementationOnce(async (callback: any) => {
      return callback(mockTx);
    });

    const result = await withRlsContext("user-uuid-1", async (tx) => {
      return tx.user.findUnique({ where: { id: "user-uuid-1" } });
    });

    expect(result).toEqual({ id: "user-uuid-1" });
    expect(mockTx.$executeRaw).toHaveBeenCalled();
  });

  it("propagates errors and rolls back when transaction callback throws", async () => {
    const mockTx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
    };

    vi.mocked(prisma.$transaction).mockImplementationOnce(async (callback: any) => {
      return callback(mockTx);
    });

    await expect(
      withRlsContext("user-uuid-1", async () => {
        throw new Error("Simulated database failure");
      })
    ).rejects.toThrow("Simulated database failure");
  });
});
