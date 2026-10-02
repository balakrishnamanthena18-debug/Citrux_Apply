import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isKnownMaliciousBot } from "@/lib/security/bot-detector";

export async function middleware(request: NextRequest) {
  // Early Bot & Automated Scraper Defense
  const userAgent = request.headers.get("user-agent");
  if (isKnownMaliciousBot(userAgent)) {
    return new NextResponse(
      JSON.stringify({ error: "Access denied by security policy." }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy";

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  /**
   * Phase 10: Middleware uses getSession() for presence/routing only (local JWT read).
   * Cryptographic identity + membership + RLS remain enforced in layout/page via getUser()
   * inside getAuthenticatedContext(). Forged cookies cannot obtain privileged data.
   */
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const hasSession = !!session?.user;

  const path = request.nextUrl.pathname;

  // Public auth paths
  const isAuthPath =
    path.startsWith("/login") ||
    path.startsWith("/register") ||
    path.startsWith("/forgot-password") ||
    path.startsWith("/verify-reset-otp") ||
    path.startsWith("/reset-password") ||
    path.startsWith("/activate") ||
    path.startsWith("/auth/activate") ||
    path.startsWith("/api/auth");

  // Recovery OTP → password update requires an authenticated recovery session on these routes.
  // Do not bounce those users to /candidate while completing password reset.
  const isPasswordRecoveryPath =
    path.startsWith("/verify-reset-otp") || path.startsWith("/reset-password");

  // Protected application paths
  const isProtectedPath =
    path.startsWith("/admin") ||
    path.startsWith("/employee") ||
    path.startsWith("/candidate");

  const isServerAction = request.headers.has("next-action");

  if (!hasSession && isProtectedPath && !isServerAction) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("redirectTo", path);
    return NextResponse.redirect(redirectUrl);
  }

  if (hasSession && isAuthPath && !path.startsWith("/api/auth") && !isPasswordRecoveryPath) {
    return NextResponse.redirect(new URL("/candidate", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
