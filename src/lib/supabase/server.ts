import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL;

  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      `[SUPABASE_SERVER] Missing configuration: url_present=${!!supabaseUrl}, key_present=${!!supabaseAnonKey}`
    );
    throw new Error(
      `Supabase configuration missing (url_present=${!!supabaseUrl}, key_present=${!!supabaseAnonKey})`
    );
  }

  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              const secureOptions = {
                ...options,
                httpOnly: options?.httpOnly ?? true,
                secure: process.env.NODE_ENV === "production",
                sameSite: options?.sameSite ?? ("lax" as const),
                path: options?.path ?? "/",
                // Default 7-day maxAge for authenticated sessions if not specified
                maxAge: options?.maxAge ?? 60 * 60 * 24 * 7,
              };
              cookieStore.set(name, value, secureOptions);
            });
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
          }
        },
      },
    }
  );
}

export { createClient as createServerClient };
