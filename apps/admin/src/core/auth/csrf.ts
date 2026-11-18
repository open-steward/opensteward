/**
 * CSRF protection via synchronizer token pattern.
 *
 * Generates a per-session CSRF token from the session cookie + a server secret.
 * The token is embedded in forms as a hidden field and validated on POST.
 *
 * Defense layers:
 *   1. SameSite=Strict cookie (prevents cross-origin cookie sending)
 *   2. CSRF token validation (prevents same-site form submission from other tabs)
 */
import { createHmac } from 'crypto'
import type { FastifyRequest, FastifyReply } from 'fastify'

const CSRF_FIELD = '_csrf'

/**
 * Generate a CSRF token from the session cookie value + server secret.
 * The token is deterministic for a given session — no server-side state needed.
 */
export function generateCsrfToken(sessionCookie: string, secret: string): string {
  return createHmac('sha256', secret).update(sessionCookie).digest('hex').slice(0, 32)
}

/**
 * Validate a CSRF token from a form submission.
 */
export function validateCsrfToken(token: string, sessionCookie: string, secret: string): boolean {
  const expected = generateCsrfToken(sessionCookie, secret)
  return token === expected
}

/**
 * Fastify preHandler hook that validates CSRF tokens on POST/PUT/DELETE requests.
 * GET/HEAD/OPTIONS are exempt (safe methods).
 */
export function csrfProtection(secret: string) {
  return (request: FastifyRequest, reply: FastifyReply, done: () => void): void => {
    const method = request.method.toUpperCase()
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      done()
      return
    }

    // Exempt paths where CSRF token is impractical (destruction-only, SameSite=Strict protects these)
    const exemptPaths = ['/logout', '/health']
    if (exemptPaths.some((p) => request.url.startsWith(p))) {
      done()
      return
    }

    const sessionCookie = request.cookies['session']
    if (!sessionCookie) {
      done() // No session = no CSRF risk (will be caught by auth middleware)
      return
    }

    const body = request.body as Record<string, unknown> | undefined
    const token = (body?.[CSRF_FIELD] as string) ?? ''

    if (!validateCsrfToken(token, sessionCookie, secret)) {
      void reply.status(403).send({ error: 'Invalid or missing CSRF token' })
      return
    }

    done()
  }
}
