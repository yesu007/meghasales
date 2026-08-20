import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

// Defense-in-depth baseline: must be logged in at all, for every API route
// and every dashboard page. This does NOT replace the per-route
// requirePermission()/requireAnyPermission() checks (src/lib/rbac.ts), which
// stay the source of truth for fine-grained access — middleware here runs on
// the Edge runtime (Next.js 14.2), so it can only read the JWT's cached
// roles/permissions claims, not re-check a live DB grant.
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // NextAuth's own endpoints (sign-in, session, csrf, callback) must stay
  // reachable while logged out — that's how logging in happens at all.
  if (pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (token) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('callbackUrl', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/api/:path*', '/dashboard/:path*'],
};
