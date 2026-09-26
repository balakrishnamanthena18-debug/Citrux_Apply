import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  EmailNotificationService,
  GmailSmtpAdapter,
  getEmailService,
} from "@/lib/email";
import { prisma } from "@/lib/db/prisma";

vi.mock("@/lib/env", () => ({
  getEnv: vi.fn().mockReturnValue({
    DATABASE_URL: "postgresql://localhost:5432/test",
    DIRECT_URL: "postgresql://localhost:5432/test",
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
    SMTP_HOST: "smtp.gmail.com",
    SMTP_PORT: "465",
    SMTP_USER: "",
    SMTP_PASS: "",
    EMAIL_FROM: "test@example.com",
  }),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    emailDeliveryLog: {
      create: vi.fn().mockResolvedValue({ id: "log-1" }),
      update: vi.fn().mockResolvedValue({ id: "log-1" }),
    },
  },
}));

describe("Phase 7 Email Provider Abstraction & Dispatch (tests/unit/email-provider.test.ts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. GmailSmtpAdapter handles unconfigured SMTP in simulated mode cleanly", async () => {
    const adapter = new GmailSmtpAdapter();
    const result = await adapter.send({
      to: "candidate@example.com",
      subject: "Application Update",
      html: "<p>Your application status has updated.</p>",
      text: "Your application status has updated.",
    });

    expect(result.success).toBe(true);
    expect(result.providerMessageId).toContain("simulated-");
  });

  it("2. EmailNotificationService logs delivery attempt to EmailDeliveryLog in PostgreSQL", async () => {
    const service = getEmailService();
    const result = await service.sendTransactionalNotification({
      organizationId: "11111111-1111-4111-8111-111111111111",
      recipientEmail: "recipient@example.com",
      templateId: "INTERVIEW_INVITE",
      subject: "Interview Requested",
      htmlBody: "<p>We would like to invite you to an interview.</p>",
      textBody: "We would like to invite you to an interview.",
    });

    expect(result).toBeDefined();
    expect(prisma.emailDeliveryLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipientEmail: "recipient@example.com",
        subject: "Interview Requested",
        status: "QUEUED",
      }),
    });
    expect(prisma.emailDeliveryLog.update).toHaveBeenCalled();
  });

  it("3. EmailNotificationService gracefully handles provider failure without throwing uncaught errors", async () => {
    const failingProvider = {
      send: vi.fn().mockResolvedValue({
        success: false,
        error: "SMTP connection timed out",
      }),
    };

    const service = new EmailNotificationService(failingProvider);
    await service.sendTransactionalNotification({
      organizationId: "11111111-1111-4111-8111-111111111111",
      recipientEmail: "recipient@example.com",
      templateId: "GENERIC_ERROR_TEST",
      subject: "Test Failure",
      htmlBody: "<p>Test</p>",
      textBody: "Test",
    });

    expect(prisma.emailDeliveryLog.update).toHaveBeenCalledWith({
      where: { id: "log-1" },
      data: expect.objectContaining({
        status: "FAILED",
        failureReason: "SMTP connection timed out",
      }),
    });
  });
});
