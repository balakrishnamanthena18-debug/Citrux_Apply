import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import {
  ApplicationStatus,
  ContractStatus,
  ResumeReviewStatus,
  InterviewRoundStatus,
} from "@/generated/prisma";
import { redirect } from "next/navigation";
import { CandidateCommandCenter } from "@/components/candidate/CandidateCommandCenter";
import { CandidateActionItem } from "@/components/candidate/CandidateActionCenter";
import { CandidateActivityEvent } from "@/components/candidate/CandidateActivityFeed";
import { CandidateApplicationData } from "@/components/candidate/CandidateApplicationCard";
import { CandidateVaultDocument } from "@/components/candidate/CandidateDocumentVault";
import { NextBestActionData } from "@/components/candidate/CandidateNextBestAction";
import { CareerMilestone } from "@/components/candidate/CandidateCareerProgress";
import { CandidateUpcomingEventItem } from "@/components/candidate/CandidateUpcomingEvents";
import { CandidateServiceContractData } from "@/components/candidate/CandidateServiceStatus";

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
        interviews: {
          include: {
            application: {
              include: { job: true },
            },
            rounds: {
              where: { voidedAt: null },
              orderBy: { roundNumber: "asc" },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        resumeReviews: {
          where: { status: ResumeReviewStatus.READY },
          orderBy: { completedAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            overallLabel: true,
            overallSummary: true,
            recommendations: true,
            completedAt: true,
          },
        },
        serviceContracts: {
          where: { status: ContractStatus.ACTIVE },
          take: 1,
          select: {
            id: true,
            contractNumber: true,
            serviceType: true,
            billingCadence: true,
            currency: true,
            status: true,
            effectiveDate: true,
            expirationDate: true,
            entitlements: {
              select: {
                id: true,
                entitlementType: true,
                allocatedQuota: true,
                consumedQuota: true,
              },
            },
          },
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
          interviews: {
            include: {
              application: {
                include: { job: true },
              },
              rounds: {
                where: { voidedAt: null },
                orderBy: { roundNumber: "asc" },
              },
            },
            orderBy: { createdAt: "desc" },
          },
          resumeReviews: {
            where: { status: ResumeReviewStatus.READY },
            orderBy: { completedAt: "desc" },
            take: 1,
            select: {
              id: true,
              status: true,
              overallLabel: true,
              overallSummary: true,
              recommendations: true,
              completedAt: true,
            },
          },
          serviceContracts: {
            where: { status: ContractStatus.ACTIVE },
            take: 1,
            select: {
              id: true,
              contractNumber: true,
              serviceType: true,
              billingCadence: true,
              currency: true,
              status: true,
              effectiveDate: true,
              expirationDate: true,
              entitlements: {
                select: {
                  id: true,
                  entitlementType: true,
                  allocatedQuota: true,
                  consumedQuota: true,
                },
              },
            },
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

  // 1. Calculate Greeting Time & Candidate Display Name
  const hour = new Date().getHours();
  const greetingTime =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const candidateName =
    [candidate.user?.firstName, candidate.user?.lastName].filter(Boolean).join(" ") ||
    candidate.user?.email?.split("@")[0] ||
    "Candidate";

  // 2. Authoritative Metric Definitions & Calculations
  const terminalStatuses: ApplicationStatus[] = [
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
    ApplicationStatus.FAILED,
  ];

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

  const preparingCount = allApplications.filter((a) =>
    preparingStatuses.includes(a.status)
  ).length;

  const underReviewCount = allApplications.filter((a) =>
    underReviewStatuses.includes(a.status)
  ).length;

  const awaitingApprovalApps = allApplications.filter(
    (app) => app.status === ApplicationStatus.AWAITING_APPROVAL
  );

  const readyCount = allApplications.filter(
    (a) => a.status === ApplicationStatus.READY
  ).length;

  const submittedCount = allApplications.filter((a) =>
    submittedStatuses.includes(a.status)
  ).length;

  const employerResponseCount = allApplications.filter((a) =>
    terminalStatuses.includes(a.status)
  ).length;

  // Authoritative Active Applications Count:
  // Non-terminal applications in active search lifecycle (prep, review, approval, ready, submitted)
  const activeApplicationsCount = allApplications.filter(
    (a) => !terminalStatuses.includes(a.status)
  ).length;

  // 3. Extract Real Upcoming Interviews from Interview OS
  const upcomingEvents: CandidateUpcomingEventItem[] = [];
  candidate.interviews.forEach((iv) => {
    iv.rounds.forEach((round) => {
      if (round.status !== InterviewRoundStatus.ROUND_CANCELLED) {
        upcomingEvents.push({
          id: round.id,
          interviewId: iv.id,
          applicationId: iv.applicationId,
          companyName: iv.application.job.companyName,
          jobTitle: iv.application.job.title,
          roundTitle: round.roundTitle,
          roundType: round.roundType,
          status: round.status,
          scheduledStartTime: round.scheduledStartTime,
          scheduledEndTime: round.scheduledEndTime,
          meetingUrl: round.meetingUrl,
          location: round.location,
          format: round.format,
          candidatePreparationNotes: round.candidatePreparationNotes,
        });
      }
    });
  });

  upcomingEvents.sort((a, b) => {
    if (!a.scheduledStartTime && !b.scheduledStartTime) return 0;
    if (!a.scheduledStartTime) return 1;
    if (!b.scheduledStartTime) return -1;
    return new Date(a.scheduledStartTime).getTime() - new Date(b.scheduledStartTime).getTime();
  });

  const scheduledInterviewsCount = upcomingEvents.length;

  // 4. Derive Authoritative Action Items
  const actions: CandidateActionItem[] = [];

  // A. Pending Approvals
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

  // 5. Determine Deterministic Single Next Best Action
  let nextBestAction: NextBestActionData;
  const latestResumeReview = candidate.resumeReviews[0];
  const firstApp = awaitingApprovalApps[0];

  if (firstApp) {
    nextBestAction = {
      tone: "urgent",
      badgeText: "Action Required · Sign-off Needed",
      title: `Approve tailored application: ${firstApp.job.title} at ${firstApp.job.companyName}`,
      description: `Your operations specialist has prepared tailored materials and completed quality checks. We require your explicit sign-off before submitting.`,
      whyItMatters: "We enforce a strict candidate consent boundary: materials are never submitted to employer portals without your explicit sign-off.",
      whatHappensNext: "Once approved, this application transitions to Ready and is queued for manual portal intake by our submission desk.",
      actionUrl: `/candidate/applications/${firstApp.id}`,
      actionLabel: "Review & Sign Off",
    };
  } else if (candidate.documents.length === 0) {
    nextBestAction = {
      tone: "important",
      badgeText: "Prerequisite Needed",
      title: "Upload your master resume into the Document Vault",
      description: "Your vault is missing a baseline resume. Upload your resume so specialists can extract verified facts and begin tailoring applications.",
      whyItMatters: "Operations needs your baseline career credentials to accurately match listings and generate customized application packages without inventing facts.",
      whatHappensNext: "Specialists extract your employment history, competencies, and achievements to stage tailored proposals for your review.",
      actionUrl: "/candidate/profile",
      actionLabel: "Upload Master Resume",
    };
  } else if (candidate.verificationNotes && candidate.verificationStatus !== "VERIFIED") {
    nextBestAction = {
      tone: "urgent",
      badgeText: "Verification Action Requested",
      title: "Update profile information per desk notes",
      description: candidate.verificationNotes,
      whyItMatters: "Ensuring factual alignment across your resume, certifications, and work history guarantees truthful representations on employer portals.",
      whatHappensNext: "Your specialist will review the updated profile, complete verification, and proceed with active submissions.",
      actionUrl: "/candidate/profile",
      actionLabel: "Update Profile Details",
    };
  } else if (!candidate.phone || (!candidate.city && !candidate.country)) {
    nextBestAction = {
      tone: "important",
      badgeText: "Contact Details Missing",
      title: "Add your phone number and geographic location",
      description: "Provide your phone number and primary location so operations can target eligible geographic and remote listings.",
      whyItMatters: "Employers discard applications missing direct contact channels or verifiable candidate locations.",
      whatHappensNext: "Operations will apply location boundaries to filter matching jobs and format employer submission headers.",
      actionUrl: "/candidate/profile",
      actionLabel: "Complete Contact Info",
    };
  } else if (!candidate.workAuthorization || candidate.workAuthorization === "OTHER") {
    nextBestAction = {
      tone: "important",
      badgeText: "Eligibility Check",
      title: "Confirm work authorization and citizenship status",
      description: "Clarify your citizenship or visa sponsorship requirements for accurate job qualification.",
      whyItMatters: "Prevents wasted submissions to employers that do not support your specific visa or work authorization status.",
      whatHappensNext: "Operations ensures all targeted applications align strictly with your legal authorization boundaries.",
      actionUrl: "/candidate/profile",
      actionLabel: "Set Authorization",
    };
  } else if (
    latestResumeReview?.recommendations &&
    Array.isArray(latestResumeReview.recommendations) &&
    (latestResumeReview.recommendations as any[]).length > 0
  ) {
    nextBestAction = {
      tone: "important",
      badgeText: "Resume Optimization",
      title: "Review tailored resume recommendations",
      description: "Intelligence analysis identified high-impact keyword and framing enhancements for your target roles.",
      whyItMatters: "Incorporating verified achievements and relevant skills increases ATS pass rates across qualified positions.",
      whatHappensNext: "Your specialist will incorporate approved recommendations into your upcoming application packages.",
      actionUrl: "/candidate/profile",
      actionLabel: "View Recommendations",
    };
  } else {
    nextBestAction = {
      tone: "calm",
      badgeText: "Desk Active · All Caught Up",
      title: "All caught up — your pipeline is actively managed",
      description: "All profile prerequisites, verification requirements, and material approvals are up to date.",
      whyItMatters: "Your career operations desk is actively monitoring employer portal responses, reviewing new job matches, and managing your submissions.",
      whatHappensNext: "You will be notified immediately when an employer responds, an interview is requested, or tailored materials need your review.",
      actionUrl: "/candidate/applications",
      actionLabel: "View Active Pipeline",
    };
  }

  // 6. Derive Transparent Career Milestones
  const isProfileSetup = Boolean(
    candidate.phone &&
    (candidate.city || candidate.country) &&
    candidate.workAuthorization &&
    candidate.workAuthorization !== "OTHER"
  );
  const hasResume = candidate.documents.length > 0;
  const isVerified = candidate.verificationStatus === "VERIFIED";
  const hasActiveApps = activeApplicationsCount > 0;
  const hasSubmissions = submittedCount > 0;
  const hasInterviews = scheduledInterviewsCount > 0;

  const milestones: CareerMilestone[] = [
    {
      id: "m1",
      number: 1,
      title: "Profile & Career Boundaries",
      shortTitle: "Profile & Boundaries",
      description: "Contact channels, geographic location, and legal work authorization confirmed.",
      status: isProfileSetup ? "COMPLETED" : "CURRENT",
      prerequisiteText: isProfileSetup ? undefined : "Add phone number, location, and work authorization in profile.",
      actionUrl: isProfileSetup ? undefined : "/candidate/profile",
      actionLabel: isProfileSetup ? undefined : "Complete Profile",
    },
    {
      id: "m2",
      number: 2,
      title: "Master Resume & Vault Assets",
      shortTitle: "Resume Vault",
      description: "Baseline resume and credentials stored in immutable Document Vault.",
      status: hasResume ? "COMPLETED" : isProfileSetup ? "CURRENT" : "UPCOMING",
      prerequisiteText: hasResume ? undefined : "Upload baseline master resume to vault.",
      actionUrl: hasResume ? undefined : "/candidate/profile",
      actionLabel: hasResume ? undefined : "Upload Resume",
    },
    {
      id: "m3",
      number: 3,
      title: "Operational Factual Verification",
      shortTitle: "Desk Verification",
      description: "Identity, career history, and boundary alignment verified by operations staff.",
      status: isVerified ? "COMPLETED" : (isProfileSetup && hasResume) ? "CURRENT" : "UPCOMING",
      prerequisiteText: isVerified ? undefined : "Review any verification notes from your specialist.",
      actionUrl: isVerified ? undefined : "/candidate/profile",
      actionLabel: isVerified ? undefined : "Check Verification",
    },
    {
      id: "m4",
      number: 4,
      title: "Opportunity Sourcing & Material Tailoring",
      shortTitle: "Role Tailoring",
      description: "Specialists match verified listings, tailor resumes, and run quality assurance.",
      status: hasSubmissions ? "COMPLETED" : (isVerified && hasActiveApps) ? "CURRENT" : "UPCOMING",
      prerequisiteText: hasActiveApps ? undefined : "Awaiting job qualification by operations team.",
      actionUrl: "/candidate/applications",
      actionLabel: "View Applications",
    },
    {
      id: "m5",
      number: 5,
      title: "Employer Submissions & Receipts",
      shortTitle: "Submissions",
      description: "Approved packages dispatched to employer portals with verified submission receipts.",
      status: hasSubmissions ? "COMPLETED" : (readyCount > 0 || awaitingApprovalApps.length > 0) ? "CURRENT" : "UPCOMING",
      prerequisiteText: hasSubmissions ? undefined : "Approve prepared application packages for submission.",
      actionUrl: "/candidate/applications",
      actionLabel: "Track Submissions",
    },
    {
      id: "m6",
      number: 6,
      title: "Interview Operating System & Placement",
      shortTitle: "Interviews & Offers",
      description: "Employer interview rounds, preparation briefs, and offer evaluation.",
      status: hasInterviews ? "CURRENT" : hasSubmissions ? "CURRENT" : "UPCOMING",
      prerequisiteText: hasInterviews ? undefined : "Awaiting employer interview invitation responses.",
      actionUrl: "/candidate/interviews",
      actionLabel: "Interview Schedule",
    },
  ];

  let currentStageName = "Stage 1: Profile & Career Setup";
  if (hasInterviews) {
    currentStageName = `Stage 6: Interview Operating System Active (${scheduledInterviewsCount} Round${scheduledInterviewsCount === 1 ? "" : "s"})`;
  } else if (hasSubmissions) {
    currentStageName = `Stage 5: ${submittedCount} Active Employer Submission${submittedCount === 1 ? "" : "s"} in Play`;
  } else if (hasActiveApps) {
    currentStageName = `Stage 4: ${activeApplicationsCount} Role${activeApplicationsCount === 1 ? "" : "s"} in Preparation & Review`;
  } else if (isVerified) {
    currentStageName = "Stage 3: Profile Verified · Awaiting Initial Matches";
  } else if (hasResume) {
    currentStageName = "Stage 2: Master Resume Vault Active";
  }

  // 7. Construct Enriched Candidate Activity Events
  const activities: CandidateActivityEvent[] = [];

  allApplications.slice(0, 6).forEach((app) => {
    if (app.status === ApplicationStatus.SUBMITTED && app.submissions[0]) {
      activities.push({
        id: `act-sub-${app.id}`,
        type: "SUBMISSION",
        title: `Application submitted to ${app.job.companyName}`,
        description: `Your application for ${app.job.title} was submitted to the employer portal.`,
        whatItMeans: "Official employer submission receipt has been verified and recorded by our operations desk.",
        whatHappensNext: "The employer's talent team will review the tailored package; screening invitations will be posted to your schedule.",
        candidateActionNeeded: false,
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
        whatItMeans: "Your dedicated specialist drafted customized resume bullets and verified qualification criteria.",
        whatHappensNext: "Review and sign off on the package so our submission desk can dispatch it to the employer.",
        candidateActionNeeded: true,
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
        whatItMeans: "Internal quality assurance review completed; package is queued for portal intake.",
        whatHappensNext: "Submission specialist will complete external employer portal entry and record proof.",
        candidateActionNeeded: false,
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
        whatItMeans: "Specialist is tailoring your credentials against the role's core technical requirements.",
        whatHappensNext: "Materials will undergo quality assurance and be staged for your sign-off.",
        candidateActionNeeded: false,
        timestamp: app.updatedAt,
        linkUrl: `/candidate/applications/${app.id}`,
        linkText: "Track progress",
      });
    } else if (terminalStatuses.includes(app.status)) {
      activities.push({
        id: `act-term-${app.id}`,
        type: "OUTCOME",
        title: `Status update: ${app.job.companyName}`,
        description: `Application for ${app.job.title} is now ${app.status.toLowerCase()}.`,
        whatItMeans: "This role is closed or archived in your active search pipeline.",
        whatHappensNext: "Operations continues active tailoring on other qualified open positions.",
        candidateActionNeeded: false,
        timestamp: app.updatedAt,
        linkUrl: `/candidate/applications/${app.id}`,
        linkText: "View archive record",
      });
    }
  });

  candidate.documents.slice(0, 2).forEach((doc) => {
    activities.push({
      id: `act-doc-${doc.id}`,
      type: "DOCUMENT",
      title: `Document updated: ${doc.title}`,
      description: `${doc.documentType.replace(/_/g, " ")} (v${doc.versionNumber}) stored securely in vault.`,
      whatItMeans: "Document is immutable and available for specialist review and tailoring reference.",
      whatHappensNext: "Operations desk references this baseline file for verified work history facts.",
      candidateActionNeeded: false,
      timestamp: doc.createdAt,
      linkUrl: "/candidate/profile",
      linkText: "Open Document Vault",
    });
  });

  // Sort activities newest first
  activities.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  // 8. Structure Specialist Data
  const assignedEmp = candidate.assignedEmployee;
  const specialist = assignedEmp
    ? {
        id: assignedEmp.id,
        firstName: assignedEmp.firstName,
        lastName: assignedEmp.lastName,
        email: assignedEmp.email,
        designationName:
          assignedEmp.memberships[0]?.designation?.name || "Application Operations Specialist",
      }
    : null;

  // 9. Structure Service Contract Data (if applicable)
  const activeContract = candidate.serviceContracts[0];
  const serviceContract: CandidateServiceContractData | null = activeContract
    ? {
        id: activeContract.id,
        contractNumber: activeContract.contractNumber,
        serviceType: activeContract.serviceType,
        billingCadence: activeContract.billingCadence,
        currency: activeContract.currency,
        status: activeContract.status,
        effectiveDate: activeContract.effectiveDate,
        expirationDate: activeContract.expirationDate,
        entitlements: activeContract.entitlements.map((ent: any) => ({
          id: ent.id,
          entitlementType: ent.entitlementType,
          allocatedQuota: ent.allocatedQuota,
          consumedQuota: ent.consumedQuota,
        })),
      }
    : null;

  return (
    <CandidateCommandCenter
      candidateName={candidateName}
      candidateGreetingTime={greetingTime}
      actions={actions}
      nextBestAction={nextBestAction}
      careerMilestones={milestones}
      currentStageName={currentStageName}
      upcomingEvents={upcomingEvents}
      serviceContract={serviceContract}
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
        verificationNotes: candidate.verificationNotes,
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
        scheduledInterviewsCount: scheduledInterviewsCount,
      }}
    />
  );
}
