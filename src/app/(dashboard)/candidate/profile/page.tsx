import { getAuthenticatedContext } from "@/lib/auth/context";
import { withRlsContext } from "@/lib/db/rls";
import { CandidateProfileManager } from "@/components/CandidateProfileManager";
import { redirect } from "next/navigation";

export default async function CandidateProfilePage() {
  const ctx = await getAuthenticatedContext();
  if (ctx.role === "ADMIN") redirect("/admin");
  if (ctx.role === "EMPLOYEE") redirect("/employee");

  const candidate = await withRlsContext(ctx.userId, async (tx) => {
    let cand = await tx.candidate.findUnique({
      where: { userId: ctx.userId },
      include: {
        experiences: { orderBy: { orderIndex: "asc" } },
        educations: { orderBy: { orderIndex: "asc" } },
        skills: { orderBy: { createdAt: "asc" } },
        projects: { orderBy: { orderIndex: "asc" } },
        certifications: { orderBy: { createdAt: "asc" } },
        documents: { orderBy: { createdAt: "desc" } },
        assignedEmployee: true,
        user: true,
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
          assignedEmployee: true,
          user: true,
        },
      });
    }

    return cand;
  });

  const userName = [candidate.user?.firstName, candidate.user?.lastName].filter(Boolean).join(" ") || "Candidate";

  return (
    <div className="pb-16 max-w-6xl mx-auto">
      <CandidateProfileManager
        candidate={candidate}
        userEmail={candidate.user?.email || ctx.email}
        userName={userName}
      />
    </div>
  );
}
