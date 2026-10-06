import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { CandidateCareerWorkspace } from "@/components/candidate/CandidateCareerWorkspace";
import { CandidateHistoryItem } from "@/components/candidate/CareerChangeHistory";
import { isCareerSectionKey } from "@/lib/candidate/career-sections";
import { getCandidate360 } from "@/lib/candidate-360/service";
import { AuditAction } from "@/generated/prisma";
import { redirect } from "next/navigation";

interface Props {
  searchParams?: Promise<{ section?: string }>;
}

export default async function CandidateProfilePage({ searchParams }: Props) {
  const ctx = await getAuthenticatedContext();
  if (ctx.role === "ADMIN") redirect("/admin");
  if (ctx.role === "EMPLOYEE") redirect("/employee");

  const resolvedParams = searchParams ? await searchParams : {};
  const initialSection = isCareerSectionKey(resolvedParams.section)
    ? resolvedParams.section
    : "overview";

  const data = await withRlsContext(ctx.userId, async (tx) => {
    let cand = await tx.candidate.findUnique({
      where: { userId: ctx.userId },
      include: {
        experiences: { orderBy: { orderIndex: "asc" } },
        educations: { orderBy: { orderIndex: "asc" } },
        skills: { orderBy: { createdAt: "asc" } },
        projects: { orderBy: { orderIndex: "asc" } },
        certifications: { orderBy: { createdAt: "asc" } },
        documents: { orderBy: { createdAt: "desc" } },
        assignedEmployee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!cand) {
      cand = await tx.candidate.create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          status: "ONBOARDING",
          verificationStatus: "UNVERIFIED",
        },
        include: {
          experiences: true,
          educations: true,
          skills: true,
          projects: true,
          certifications: true,
          documents: true,
          assignedEmployee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });
    }

    // Load candidate-safe audit change history
    const candidateAuditActions = [
      AuditAction.CANDIDATE_CREATED,
      AuditAction.CANDIDATE_PROFILE_UPDATED,
      AuditAction.CANDIDATE_EXPERIENCE_UPDATED,
      AuditAction.CANDIDATE_EDUCATION_UPDATED,
      AuditAction.CANDIDATE_SKILLS_UPDATED,
      AuditAction.CANDIDATE_DOCUMENT_UPLOADED,
      AuditAction.CANDIDATE_DOCUMENT_DELETED,
      AuditAction.CANDIDATE_VERIFIED,
      AuditAction.CANDIDATE_STATUS_CHANGED,
      AuditAction.CANDIDATE_AUTHORIZATION_MODE_CHANGED,
    ];

    const auditEvents = await tx.auditEvent.findMany({
      where: {
        organizationId: ctx.organizationId,
        action: { in: candidateAuditActions },
        OR: [
          { actorId: ctx.userId },
          { entityId: cand.id },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return { candidate: cand, auditEvents };
  });

  const { candidate, auditEvents } = data;
  const userName =
    [candidate.user?.firstName, candidate.user?.lastName].filter(Boolean).join(" ") ||
    "Candidate";

  const getHistoryDescription = (evt: (typeof auditEvents)[0]): string => {
    if (
      evt.action === AuditAction.CANDIDATE_PROFILE_UPDATED &&
      evt.entityType === "CandidateProject"
    ) {
      return "Updated your projects";
    }

    switch (evt.action) {
      case AuditAction.CANDIDATE_PROFILE_UPDATED:
        return "Updated professional profile & personal details";
      case AuditAction.CANDIDATE_EXPERIENCE_UPDATED:
        return "Updated work experience records";
      case AuditAction.CANDIDATE_EDUCATION_UPDATED:
        return "Updated academic credentials & education history";
      case AuditAction.CANDIDATE_SKILLS_UPDATED:
        return "Updated technical competencies in skills catalog";
      case AuditAction.CANDIDATE_DOCUMENT_UPLOADED:
        return "Uploaded new document to candidate vault";
      case AuditAction.CANDIDATE_DOCUMENT_DELETED:
        return "Removed document from candidate vault";
      case AuditAction.CANDIDATE_VERIFIED:
        return "Specialist reviewed and verified candidate profile facts";
      case AuditAction.CANDIDATE_STATUS_CHANGED:
        return "Candidate lifecycle status transitioned";
      case AuditAction.CANDIDATE_AUTHORIZATION_MODE_CHANGED:
        return "Application authorization preference updated";
      case AuditAction.CANDIDATE_CREATED:
        return "Initialized career profile";
      default:
        return "Updated career profile";
    }
  };

  const changeHistory: CandidateHistoryItem[] = auditEvents.map((evt) => ({
    id: evt.id,
    action: evt.action,
    description: getHistoryDescription(evt),
    timestamp: evt.createdAt,
    entityType: evt.entityType,
  }));

  // Fetch read-only Candidate 360 Career Intelligence DTO
  const candidate360 = await getCandidate360(candidate.id, ctx);

  const workspaceKey = [
    candidate.id,
    candidate.updatedAt?.toISOString?.() ?? String(candidate.updatedAt ?? ""),
    initialSection,
    candidate.projects?.length ?? 0,
    candidate.experiences?.length ?? 0,
    candidate.educations?.length ?? 0,
    candidate.skills?.length ?? 0,
    candidate.certifications?.length ?? 0,
    candidate.documents?.length ?? 0,
  ].join(":");

  return (
    <CandidateCareerWorkspace
      key={workspaceKey}
      candidate={candidate}
      candidate360={candidate360}
      userEmail={candidate.user?.email || ctx.email}
      userName={userName}
      changeHistory={changeHistory}
      initialSection={initialSection}
    />
  );
}
