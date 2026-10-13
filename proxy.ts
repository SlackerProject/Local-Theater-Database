import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Refreshes the Supabase session cookie on each request so signed-in
// visitors stay signed in. Page-level checks still decide who sees what.
const MAIN_HOST = "localtheaterdatabase.com";

export async function proxy(request: NextRequest) {
  // One secure address: www and plain http go to https://localtheaterdatabase.com
  const host = (request.headers.get("host") ?? "").toLowerCase();
  // Cloudflare tells us how the visitor connected; without the header
  // (local testing) nothing is redirected for http
  const proto = request.headers.get("x-forwarded-proto");
  if (host === `www.${MAIN_HOST}` || (host === MAIN_HOST && proto === "http")) {
    const url = new URL(request.nextUrl.pathname + request.nextUrl.search, `https://${MAIN_HOST}`);
    return NextResponse.redirect(url, 308);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
