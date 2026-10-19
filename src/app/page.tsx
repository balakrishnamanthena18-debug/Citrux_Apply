import { redirect } from "next/navigation";
import { getAuthenticatedContext } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

/**
 * Root route policy for portal.careerbutton.in:
 * - Unauthenticated visitors redirect cleanly to /login.
 * - Authenticated users redirect to their role-appropriate workspace (/candidate, /employee, or /admin).
 * Cryptographic identity and active membership are verified via getAuthenticatedContext().
 */
export default async function HomePage() {
  let ctx;
  try {
    ctx = await getAuthenticatedContext();
  } catch {
    redirect("/login");
  }

  if (ctx.role === "ADMIN") {
    redirect("/admin");
  } else if (ctx.role === "EMPLOYEE") {
    redirect("/employee");
  } else {
    redirect("/candidate");
  }
}
