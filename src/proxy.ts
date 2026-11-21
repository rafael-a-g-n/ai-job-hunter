import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/** Optimistic gate only (cookie presence); real checks happen in `requireUser`. */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();
  const url = new URL("/sign-in", request.url);
  url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/cv/:path*",
    "/jobs/:path*",
    "/letters/:path*",
    "/settings/:path*",
  ],
};
