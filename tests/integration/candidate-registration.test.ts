import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { signUpCandidateAction } from "@/lib/auth/actions";
import { prisma } from "@/lib/db/prisma";
import { withRlsContext } from "@/lib/db/rls";
import { createServerClient } from "@/lib/supabase/server";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    organization: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    $executeRaw: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createServerClient: vi.fn(),
}));

vi.mock("@/lib/db/rls", () => ({
  withRlsContext: vi.fn(async (_userId, callback) => {
    const tx = {
      user: {
        create: vi.fn(),
      },
      membership: {
        create: vi.fn(),
      },
      auditEvent: {
        create: vi.fn(),
      },
    };
    return callback(tx as any);
  }),
}));

describe("Candidate Tenancy & Registration Security (tests/integration/candidate-registration.test.ts)", () => {
  const originalEnv = process.env.OPERATING_ORGANIZATION_ID;
  const mockOrgId = "123e4567-e89b-12d3-a456-426614174000";

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPERATING_ORGANIZATION_ID = mockOrgId;
  });

  afterEach(() => {
    process.env.OPERATING_ORGANIZATION_ID = originalEnv;
  });

  it("1. Successfully registers candidate and assigns CANDIDATE role within configured operating organization", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce({
      id: mockOrgId,
      name: "Acme Operating Co",
      slug: "acme-ops",
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const mockSupabaseAuth = {
      signUp: vi.fn().mockResolvedValueOnce({
        data: { user: { id: "auth-user-candidate-1", email: "candidate@example.com" } },
        error: null,
      }),
    };

    vi.mocked(createServerClient).mockResolvedValueOnce({
      auth: mockSupabaseAuth,
    } as any);

    let createdMembershipData: any = null;
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        user: { create: vi.fn().mockResolvedValue({}) },
        membership: {
          create: vi.fn().mockImplementation((args) => {
            createdMembershipData = args.data;
            return Promise.resolve(args.data);
          }),
        },
        auditEvent: { create: vi.fn().mockResolvedValue({}) },
      };
      return callback(tx as any);
    });

    const formData = new FormData();
    formData.append("email", "candidate@example.com");
    formData.append("password", "Password123!");
    formData.append("firstName", "Jane");
    formData.append("lastName", "Doe");

    const result = await signUpCandidateAction(formData);

    expect(result.success).toBe(true);
    expect(prisma.organization.findUnique).toHaveBeenCalledWith({
      where: { id: mockOrgId },
    });
    expect(createdMembershipData).toEqual({
      organizationId: mockOrgId,
      userId: "auth-user-candidate-1",
      role: "CANDIDATE",
      status: "ACTIVE",
    });
  });

  it("2. Fails closed when OPERATING_ORGANIZATION_ID is missing from server configuration", async () => {
    delete process.env.OPERATING_ORGANIZATION_ID;

    const formData = new FormData();
    formData.append("email", "candidate@example.com");
    formData.append("password", "Password123!");
    formData.append("firstName", "Jane");
    formData.append("lastName", "Doe");

    const result = await signUpCandidateAction(formData);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Operating organization configuration is missing");
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("3. Fails closed when configured operating organization is INACTIVE or not found", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce({
      id: mockOrgId,
      name: "Suspended Co",
      slug: "suspended-ops",
      status: "SUSPENDED",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const formData = new FormData();
    formData.append("email", "candidate@example.com");
    formData.append("password", "Password123!");
    formData.append("firstName", "Jane");
    formData.append("lastName", "Doe");

    const result = await signUpCandidateAction(formData);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Operating organization is unavailable or inactive");
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("4. Prevents client from overriding organizationId via input payload", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce({
      id: mockOrgId,
      name: "Acme Operating Co",
      slug: "acme-ops",
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const mockSupabaseAuth = {
      signUp: vi.fn().mockResolvedValueOnce({
        data: { user: { id: "auth-user-candidate-2", email: "attacker@example.com" } },
        error: null,
      }),
    };

    vi.mocked(createServerClient).mockResolvedValueOnce({
      auth: mockSupabaseAuth,
    } as any);

    let createdMembershipData: any = null;
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        user: { create: vi.fn().mockResolvedValue({}) },
        membership: {
          create: vi.fn().mockImplementation((args) => {
            createdMembershipData = args.data;
            return Promise.resolve(args.data);
          }),
        },
        auditEvent: { create: vi.fn().mockResolvedValue({}) },
      };
      return callback(tx as any);
    });

    const formData = new FormData();
    formData.append("email", "attacker@example.com");
    formData.append("password", "Password123!");
    formData.append("firstName", "Attacker");
    formData.append("lastName", "User");
    // Attempted client override
    formData.append("organizationId", "99999999-9999-9999-9999-999999999999");
    formData.append("role", "ADMIN");

    const result = await signUpCandidateAction(formData);

    expect(result.success).toBe(true);
    // Verified that client organizationId and role are strictly discarded
    expect(createdMembershipData.organizationId).toBe(mockOrgId);
    expect(createdMembershipData.role).toBe("CANDIDATE");
  });

  it("5. Candidate always receives CANDIDATE role and never ADMIN or EMPLOYEE", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce({
      id: mockOrgId,
      name: "Acme Operating Co",
      slug: "acme-ops",
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const mockSupabaseAuth = {
      signUp: vi.fn().mockResolvedValueOnce({
        data: { user: { id: "auth-user-candidate-3", email: "candidate3@example.com" } },
        error: null,
      }),
    };

    vi.mocked(createServerClient).mockResolvedValueOnce({
      auth: mockSupabaseAuth,
    } as any);

    let createdMembershipRole = "";
    vi.mocked(withRlsContext).mockImplementationOnce(async (_userId, callback) => {
      const tx = {
        user: { create: vi.fn().mockResolvedValue({}) },
        membership: {
          create: vi.fn().mockImplementation((args) => {
            createdMembershipRole = args.data.role;
            return Promise.resolve(args.data);
          }),
        },
        auditEvent: { create: vi.fn().mockResolvedValue({}) },
      };
      return callback(tx as any);
    });

    const formData = new FormData();
    formData.append("email", "candidate3@example.com");
    formData.append("password", "Password123!");
    formData.append("firstName", "Candidate");
    formData.append("lastName", "Three");

    await signUpCandidateAction(formData);

    expect(createdMembershipRole).toBe("CANDIDATE");
  });
});
