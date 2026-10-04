import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
const digest = (text: string) => createHash('sha256').update(text).digest();
export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Content-Security-Policy', `default-src 'self'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`);
  const path = request.nextUrl.pathname;
  if (path === '/' || path === '/demo' || path.startsWith('/demo/') || path.startsWith('/_next/') || process.env.PRISM_DEMO === 'true') return response;
  const password = process.env.PRISM_ADMIN_PASSWORD, username = process.env.PRISM_ADMIN_USER ?? 'operator';
  if (!password || password.length < 16) return new NextResponse('Operator authentication is not configured. Set PRISM_ADMIN_PASSWORD (at least 16 characters). Public demo: /demo', { status: 503 });
  const authorization = request.headers.get('authorization') ?? '';
  if (authorization.startsWith('Basic ') && authorization.length < 2000) {
    const credentials = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
    if (timingSafeEqual(digest(credentials), digest(`${username}:${password}`))) {
      // Protect state-changing browser requests against cross-origin form/subresource submission.
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
        const origin = request.headers.get('origin');
        if (origin !== request.nextUrl.origin) return new NextResponse('Same-origin request required', { status: 403 });
      }
      response.headers.set('Cache-Control', 'private, no-store');
      return response;
    }
  }
  return new NextResponse('Operator authentication required', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="PRism operator", charset="UTF-8"', 'Cache-Control': 'no-store' } });
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'] };
