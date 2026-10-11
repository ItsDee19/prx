import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";

/**
 * Cookie-presence gate only (no database access on the edge). The real
 * session validation happens in `(app)/layout.tsx` via `requireUser()`.
 */

const AUTH_PATHS = new Set(["/login", "/register"]);
/** Routes that never require a session (monitoring endpoints). */
const PUBLIC_PREFIXES = ["/api/health"];

export function middleware(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const isAuthPath = AUTH_PATHS.has(pathname);
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return NextResponse.next();

  if (!hasSessionCookie && !isAuthPath) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    // "/" already redirects to the dashboard, so there is nothing to return to.
    if (pathname !== "/") loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (hasSessionCookie && isAuthPath && request.nextUrl.searchParams.has("expired")) {
    // The app layout found the cookie invalid: drop it and show the login page.
    const response = NextResponse.next();
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  if (hasSessionCookie && isAuthPath) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except Next internals, the favicon and static assets by extension.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml|json|woff|woff2|ttf|otf)$).*)",
  ],
};
