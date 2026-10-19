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

  it("renders Career Button branding when recipient is a candidate", () => {
    const html = buildNewConversationEmailHtml({
      subject: `Q&A <script>`,
      messageBody: `Hello <b>world</b>`,
      senderName: `Alex & Co`,
      conversationUrl,
      recipientIsCandidate: true,
    });

    expect(html).toContain(`href="${conversationUrl}"`);
    expect(html).toContain("Open conversation");
    expect(html).toContain("Career Button");
    expect(html).toContain("Candidate Portal");
    expect(html).not.toContain("Operations OS");
    expect(html).not.toContain("<script>");
    expect(html).toContain("Q&amp;A");
    expect(html).toContain("Alex &amp; Co");
    expect(html).toContain("&lt;b&gt;world&lt;/b&gt;");
  });

  it("preserves Operations OS branding when recipient is internal staff", () => {
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
    expect(html).toContain("Operations OS");
    expect(html).toContain("OOS");
    expect(buildNewMessageEmailSubject("Interview timing", false)).toBe(
      "OOS — New reply: Interview timing"
    );
  });

  it("builds candidate-aware subject lines and plaintext", () => {
    // Candidate recipient
    expect(buildNewConversationEmailSubject("Resume update", true)).toBe(
      "Career Button — New message: Resume update"
    );
    expect(buildNewMessageEmailSubject("Offer letter", true)).toBe(
      "Career Button — New reply: Offer letter"
    );

    const candidateText = buildNewConversationEmailText({
      subject: "Resume update",
      messageBody: "Please review the latest draft.",
      conversationUrl,
      recipientIsCandidate: true,
    });
    expect(candidateText).toContain(conversationUrl);
    expect(candidateText).toContain("Resume update");
    expect(candidateText).toContain("Career Button");
    expect(candidateText).not.toContain("Operations OS");

    // Staff recipient
    expect(buildNewConversationEmailSubject("Candidate question", false)).toBe(
      "OOS — New message: Candidate question"
    );
    expect(buildNewMessageEmailSubject("Candidate reply", false)).toBe(
      "OOS — New reply: Candidate reply"
    );

    const staffText = buildNewConversationEmailText({
      subject: "Candidate question",
      messageBody: "What are next steps?",
      conversationUrl: "http://localhost:3000/employee/messages/conv-789",
      recipientIsCandidate: false,
    });
    expect(staffText).toContain("Operations OS");
  });
});

describe("application submitted email template", () => {
  const applicationUrl = "http://localhost:3000/candidate/applications/app-789";

  it("renders Career Button candidate portal branding and candidate-safe content", () => {
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
    expect(html).toContain("Career Button");
    expect(html).toContain("Candidate Portal");
    expect(html).not.toContain("Operations OS");
    expect(html).not.toContain("storagePath");
    expect(html).not.toContain("confirmationEvidence");
  });

  it("builds Career Button subject and plaintext for application submission", () => {
    expect(buildApplicationSubmittedEmailSubject("SE", "Apple")).toBe(
      "Career Button — Application submitted: SE at Apple"
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
    expect(text).toContain("Career Button — Application submitted");
    expect(text).toContain("Career Button");
    expect(text).not.toContain("Operations OS");
  });
});
