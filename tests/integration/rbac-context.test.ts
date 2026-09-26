import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAuthenticatedContext } from "@/lib/auth/context";
import { UnauthorizedError, ForbiddenError } from "@/lib/errors";

const mockGetUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
  createServerClient: vi.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}));

vi.mock("@/lib/db/rls", () => ({
  withRlsContext: vi.fn(async (_userId, callback) => {
    return callback(mockTx as any);
  }),
}));

const mockTx = {
  membership: {
    findFirst: vi.fn(),
  },
};

import { withRlsContext } from "@/lib/db/rls";

describe("RBAC Authentication Context Resolution (tests/integration/rbac-context.test.ts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws UnauthorizedError when no Supabase session exists", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: new Error("No active session"),
    });

    await expect(getAuthenticatedContext()).rejects.toThrow(UnauthorizedError);
  });

  it("throws ForbiddenError when active organization membership is missing", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: {
        user: { id: "auth-uuid-1", email: "user@example.com" },
      },
      error: null,
    });

    mockTx.membership.findFirst.mockResolvedValueOnce(null);

    await expect(getAuthenticatedContext()).rejects.toThrow(ForbiddenError);
  });

  it("successfully returns complete AuthContext when user and membership are active", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: {
        user: { id: "auth-uuid-1", email: "candidate@example.com" },
      },
      error: null,
    });

    mockTx.membership.findFirst.mockResolvedValueOnce({
      id: "mem-cand-1",
      organizationId: "org-operating-1",
      role: "CANDIDATE",
      status: "ACTIVE",
      user: {
        id: "auth-uuid-1",
        email: "candidate@example.com",
        firstName: "Jane",
        lastName: "Candidate",
        status: "ACTIVE",
      },
      organization: {
        id: "org-operating-1",
        name: "Operating Company",
        status: "ACTIVE",
      },
    });

    const ctx = await getAuthenticatedContext();
    expect(ctx).toEqual({
      userId: "auth-uuid-1",
      email: "candidate@example.com",
      fullName: "Jane Candidate",
      organizationId: "org-operating-1",
      membershipId: "mem-cand-1",
      role: "CANDIDATE",
      status: "ACTIVE",
      membershipStatus: "ACTIVE",
    });

    expect(withRlsContext).toHaveBeenCalledWith("auth-uuid-1", expect.any(Function));
  });
});
