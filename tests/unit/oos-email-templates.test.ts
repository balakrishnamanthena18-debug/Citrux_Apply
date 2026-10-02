import { describe, expect, it } from "vitest";
import {
  buildNewConversationEmailHtml,
  buildNewConversationEmailSubject,
  buildNewConversationEmailText,
  buildNewMessageEmailHtml,
  buildNewMessageEmailSubject,
} from "@/lib/email/templates/messaging";
import {
  buildApplicationSubmittedEmailHtml,
  buildApplicationSubmittedEmailSubject,
  buildApplicationSubmittedEmailText,
} from "@/lib/email/templates/applicationSubmitted";

describe("messaging email templates", () => {
  const conversationUrl = "http://localhost:3000/candidate/messages/conv-123";

  it("preserves conversation URL and escapes dynamic content", () => {
    const html = buildNewConversationEmailHtml({
      subject: `Q&A <script>`,
      messageBody: `Hello <b>world</b>`,
      senderName: `Alex & Co`,
      conversationUrl,
      recipientIsCandidate: true,
    });

    expect(html).toContain(`href="${conversationUrl}"`);
    expect(html).toContain("Open conversation");
    expect(html).toContain("Operations OS");
    expect(html).not.toContain("<script>");
    expect(html).toContain("Q&amp;A");
    expect(html).toContain("Alex &amp; Co");
    expect(html).toContain("&lt;b&gt;world&lt;/b&gt;");
  });

  it("builds reply template with subject pattern", () => {
    const html = buildNewMessageEmailHtml({
      subject: "Interview timing",
      messageBody: "Does Thursday work?",
      senderName: "Jordan Lee",
      conversationUrl: "http://localhost:3000/employee/messages/conv-456",
      recipientIsCandidate: false,
    });

    expect(html).toContain("New reply");
    expect(html).toContain("Jordan Lee");
    expect(html).toContain("Does Thursday work?");
    expect(buildNewMessageEmailSubject("Interview timing")).toBe(
      "OOS — New reply: Interview timing"
    );
  });

  it("builds plaintext with conversation URL", () => {
    const text = buildNewConversationEmailText({
      subject: "Resume update",
      messageBody: "Please review the latest draft.",
      conversationUrl,
      recipientIsCandidate: true,
    });

    expect(text).toContain(conversationUrl);
    expect(text).toContain("Resume update");
    expect(buildNewConversationEmailSubject("Resume update")).toMatch(/^OOS — New message:/);
  });
});

describe("application submitted email template", () => {
  const applicationUrl = "http://localhost:3000/candidate/applications/app-789";

  it("preserves application URL and candidate-safe content", () => {
    const html = buildApplicationSubmittedEmailHtml({
      firstName: "Sam",
      jobTitle: "Senior Systems Engineer",
      companyName: "Linear",
      location: "Remote",
      isRemote: true,
      confirmationReference: "REF-100",
      applicationUrl,
      submittedAt: new Date("2026-09-26T12:00:00Z"),
    });

    expect(html).toContain(`href="${applicationUrl}"`);
    expect(html).toContain("Senior Systems Engineer");
    expect(html).toContain("Linear");
    expect(html).toContain("Submitted");
    expect(html).toContain("REF-100");
    expect(html).not.toContain("storagePath");
    expect(html).not.toContain("confirmationEvidence");
  });

  it("builds subject and plaintext", () => {
    expect(buildApplicationSubmittedEmailSubject("SE", "Apple")).toBe(
      "OOS — Application submitted: SE at Apple"
    );
    const text = buildApplicationSubmittedEmailText({
      firstName: "Sam",
      jobTitle: "SE",
      companyName: "Apple",
      applicationUrl,
      confirmationReference: "REF-1",
    });
    expect(text).toContain(applicationUrl);
    expect(text).toContain("REF-1");
  });
});
