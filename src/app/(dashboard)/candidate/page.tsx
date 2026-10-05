import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { ApplicationStatus } from "@/generated/prisma";
import { redirect } from "next/navigation";
import { CandidateCommandCenter } from "@/components/candidate/CandidateCommandCenter";
import { CandidateActionItem } from "@/components/candidate/CandidateActionCenter";
import { CandidateActivityEvent } from "@/components/candidate/CandidateActivityFeed";
import { CandidateApplicationData } from "@/components/candidate/CandidateApplicationCard";
import { CandidateVaultDocument } from "@/components/candidate/CandidateDocumentVault";

export default async function CandidatePortalPage() {
  const ctx = await getAuthenticatedContext();
  if (ctx.role === "ADMIN") redirect("/admin");
  if (ctx.role === "EMPLOYEE") redirect("/employee");

  const data = await withRlsContext(ctx.userId, async (tx) => {
    let candidate = await tx.candidate.findUnique({
      where: { userId: ctx.userId },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        assignedEmployee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            memberships: {
              where: { organizationId: ctx.organizationId },
              select: { designation: { select: { name: true } } },
              take: 1,
            },
          },
        },
        experiences: { select: { id: true } },
        educations: { select: { id: true } },
        skills: { select: { id: true } },
        projects: { select: { id: true } },
        documents: {
          select: {
            id: true,
            title: true,
            documentType: true,
            fileSizeBytes: true,
            mimeType: true,
            versionNumber: true,
            isDefault: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    // Auto-initialize candidate record if first time login
    if (!candidate) {
      candidate = await tx.candidate.create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          status: "ONBOARDING",
          verificationStatus: "UNVERIFIED",
        },
        include: {
          user: { select: { firstName: true, lastName: true, email: true } },
          assignedEmployee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              memberships: {
                where: { organizationId: ctx.organizationId },
                select: { designation: { select: { name: true } } },
                take: 1,
              },
            },
          },
          experiences: { select: { id: true } },
          educations: { select: { id: true } },
          skills: { select: { id: true } },
          projects: { select: { id: true } },
          documents: {
            select: {
              id: true,
              title: true,
              documentType: true,
              fileSizeBytes: true,
              mimeType: true,
              versionNumber: true,
              isDefault: true,
              createdAt: true,
              updatedAt: true,
            },
            orderBy: { createdAt: "desc" },
          },
        },
      });
    }

    // Load candidate's applications with submissions
    const allApplications = await tx.application.findMany({
      where: { candidateId: candidate.id },
      include: {
        job: true,
        submissions: {
          select: { id: true, attemptNumber: true, submittedAt: true },
          orderBy: { attemptNumber: "desc" },
          take: 1,
        },
        stateHistory: {
          select: { id: true, toStatus: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });

    return { candidate, allApplications };
  });

  const { candidate, allApplications } = data;

  // 1. Calculate Greeting Time
  const hour = new Date().getHours();
  const greetingTime =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const candidateName =
    [candidate.user?.firstName, candidate.user?.lastName].filter(Boolean).join(" ") ||
    candidate.user?.email?.split("@")[0] ||
    "Candidate";

  // 2. Derive Authoritative Action Items
  const actions: CandidateActionItem[] = [];

  // A. Pending Approvals
  const awaitingApprovalApps = allApplications.filter(
    (app) => app.status === ApplicationStatus.AWAITING_APPROVAL
  );
  awaitingApprovalApps.forEach((app) => {
    actions.push({
      id: `app-approval-${app.id}`,
      type: "APPLICATION_APPROVAL",
      priority: "NEEDS_ATTENTION",
      title: `Approve Application: ${app.job.title}`,
      description: `Your operations team has assembled tailored materials for ${app.job.companyName}. Review and sign off so we can submit.`,
      actionUrl: `/candidate/applications/${app.id}`,
      actionLabel: "Review Application",
      relatedEntity: {
        type: "Job",
        name: `${app.job.companyName} · ${app.job.title}`,
        id: app.id,
      },
      createdAt: app.updatedAt,
    });
  });

  // B. Verification Notes from Staff
  if (candidate.verificationNotes && candidate.verificationStatus !== "VERIFIED") {
    actions.push({
      id: "candidate-verification-notes",
      type: "VERIFICATION_NOTE",
      priority: "NEEDS_ATTENTION",
      title: "Action Requested on Verification",
      description: candidate.verificationNotes,
      actionUrl: "/candidate/profile",
      actionLabel: "Update Profile",
      createdAt: candidate.updatedAt,
    });
  }

  // C. Profile Completeness Checks
  if (!candidate.phone || (!candidate.city && !candidate.country)) {
    actions.push({
      id: "profile-contact-missing",
      type: "PROFILE_INFORMATION",
      priority: "IMPORTANT",
      title: "Add Contact & Location Details",
      description: "Provide your phone number and location so operations can target eligible geographic listings.",
      actionUrl: "/candidate/profile",
      actionLabel: "Complete Profile",
      createdAt: candidate.createdAt,
    });
  }

  if (candidate.documents.length === 0) {
    actions.push({
      id: "profile-resume-missing",
      type: "DOCUMENT_REQUIRED",
      priority: "IMPORTANT",
      title: "Upload Your Resume",
      description: "Upload your master resume into the Document Vault so specialists can extract facts and tailor submissions.",
      actionUrl: "/candidate/profile",
      actionLabel: "Upload Resume",
      createdAt: candidate.createdAt,
    });
  }

  if (!candidate.workAuthorization || candidate.workAuthorization === "OTHER") {
    actions.push({
      id: "profile-work-auth",
      type: "WORK_AUTHORIZATION",
      priority: "IMPORTANT",
      title: "Confirm Work Authorization Status",
      description: "Clarify your citizenship or visa sponsorship requirements for accurate job qualification.",
      actionUrl: "/candidate/profile",
      actionLabel: "Set Authorization",
      createdAt: candidate.createdAt,
    });
  }

  // 3. Construct Stats & Breakdown
  const preparingStatuses: ApplicationStatus[] = [
    ApplicationStatus.DISCOVERED,
    ApplicationStatus.QUALIFIED,
    ApplicationStatus.PREPARING,
  ];
  const underReviewStatuses: ApplicationStatus[] = [
    ApplicationStatus.REVIEW,
    ApplicationStatus.REVIEW_REQUIRED,
    ApplicationStatus.CORRECTION_APPROVED,
  ];
  const submittedStatuses: ApplicationStatus[] = [
    ApplicationStatus.SUBMITTED,
    ApplicationStatus.RESUBMISSION,
  ];
  const employerResponseStatuses: ApplicationStatus[] = [
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
    ApplicationStatus.FAILED,
  ];

  const preparingCount = allApplications.filter((a) =>
    preparingStatuses.includes(a.status)
  ).length;

  const underReviewCount = allApplications.filter((a) =>
    underReviewStatuses.includes(a.status)
  ).length;

  const readyCount = allApplications.filter(
    (a) => a.status === ApplicationStatus.READY
  ).length;

  const submittedCount = allApplications.filter((a) =>
    submittedStatuses.includes(a.status)
  ).length;

  const employerResponseCount = allApplications.filter((a) =>
    employerResponseStatuses.includes(a.status)
  ).length;

  const activeApplicationsCount =
    preparingCount + underReviewCount + awaitingApprovalApps.length + readyCount;

  // 4. Construct Safe Candidate Activity Events
  const activities: CandidateActivityEvent[] = [];

  allApplications.slice(0, 6).forEach((app) => {
    if (app.status === ApplicationStatus.SUBMITTED && app.submissions[0]) {
      activities.push({
        id: `act-sub-${app.id}`,
        type: "SUBMISSION",
        title: `Application submitted to ${app.job.companyName}`,
        description: `Your application for ${app.job.title} was submitted to the employer portal.`,
        timestamp: app.submissions[0].submittedAt,
        linkUrl: `/candidate/applications/${app.id}`,
        linkText: "View submission receipt",
      });
    } else if (app.status === ApplicationStatus.AWAITING_APPROVAL) {
      activities.push({
        id: `act-appr-${app.id}`,
        type: "APPROVAL_REQUEST",
        title: `Approval requested for ${app.job.title}`,
        description: `Materials for ${app.job.companyName} prepared and ready for your sign-off.`,
        timestamp: app.updatedAt,
        linkUrl: `/candidate/applications/${app.id}`,
        linkText: "Review & Authorize",
      });
    } else if (app.status === ApplicationStatus.READY) {
      activities.push({
        id: `act-ready-${app.id}`,
        type: "QA_PASS",
        title: `Application ready for ${app.job.companyName}`,
        description: `${app.job.title} materials approved and queued for manual submission.`,
        timestamp: app.updatedAt,
        linkUrl: `/candidate/applications/${app.id}`,
        linkText: "Inspect application",
      });
    } else if (
      app.status === ApplicationStatus.PREPARING ||
      app.status === ApplicationStatus.QUALIFIED
    ) {
      activities.push({
        id: `act-prep-${app.id}`,
        type: "PREPARATION",
        title: `Tailoring materials for ${app.job.companyName}`,
        description: `Operations team is drafting customized resume bullets for ${app.job.title}.`,
        timestamp: app.updatedAt,
        linkUrl: `/candidate/applications/${app.id}`,
        linkText: "Track progress",
      });
    }
  });

  candidate.documents.slice(0, 2).forEach((doc) => {
    activities.push({
      id: `act-doc-${doc.id}`,
      type: "DOCUMENT",
      title: `Document updated: ${doc.title}`,
      description: `${doc.documentType.replace(/_/g, " ")} (v${doc.versionNumber}) stored securely in vault.`,
      timestamp: doc.createdAt,
      linkUrl: "/candidate/profile",
      linkText: "Open Document Vault",
    });
  });

  // Sort activities newest first
  activities.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  // 5. Structure Specialist Data
  const assignedEmp = candidate.assignedEmployee;
  const specialist = assignedEmp
    ? {
        id: assignedEmp.id,
        firstName: assignedEmp.firstName,
        lastName: assignedEmp.lastName,
        email: assignedEmp.email,
        designationName: assignedEmp.memberships[0]?.designation?.name || "Application Operations Specialist",
      }
    : null;

  return (
    <CandidateCommandCenter
      candidateName={candidateName}
      candidateGreetingTime={greetingTime}
      actions={actions}
      applications={allApplications as unknown as CandidateApplicationData[]}
      candidateProfile={{
        phone: candidate.phone,
        city: candidate.city,
        country: candidate.country,
        headline: candidate.headline,
        professionalSummary: candidate.professionalSummary,
        workAuthorization: candidate.workAuthorization,
        experiencesCount: candidate.experiences.length,
        educationsCount: candidate.educations.length,
        skillsCount: candidate.skills.length,
        projectsCount: candidate.projects.length,
        documentsCount: candidate.documents.length,
        verificationStatus: candidate.verificationStatus,
      }}
      specialist={specialist}
      documents={candidate.documents as unknown as CandidateVaultDocument[]}
      activities={activities}
      stats={{
        totalApplications: allApplications.length,
        activeApplications: activeApplicationsCount,
        awaitingApprovalApplications: awaitingApprovalApps.length,
        submittedApplications: submittedCount,
        readyApplications: readyCount,
        preparingApplications: preparingCount,
        underReviewApplications: underReviewCount,
        employerResponseApplications: employerResponseCount,
      }}
    />
  );
}
