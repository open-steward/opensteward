/**
 * Shared admin-secret guard for `/connections`, `/admin/*`, `/v1/sync`, etc.
 *
 * Fails CLOSED by default in every environment:
 *   - `ADMIN_SECRET` unset → 403, unless `OST_ALLOW_UNAUTH_ADMIN=1` is set as
 *     an explicit local-dev opt-in. Opening on the mere absence of a
 *     production marker would let a bespoke `node dist/server.js` run serve
 *     the whole operator surface (connections, `/admin/*`, `/v1/sync`,
 *     connect-link tokens, customer PII) unauthenticated — so the gate is
 *     the deliberate absence of a secret PLUS an explicit flag, never an
 *     inferred environment.
 *   - `ADMIN_SECRET` set → require a matching `X-Admin-Secret` header, 403 otherwise.
 */
import type { FastifyReply, FastifyRequest } from 'fastify'
import { safeStrEqual } from '../util/safe-equal'

export function adminGuard(request: FastifyRequest, reply: FastifyReply): boolean {
  const expected = process.env['ADMIN_SECRET']
  if (!expected) {
    // Explicit, deliberate dev opt-in only — never inferred from NODE_ENV.
    if (process.env['OST_ALLOW_UNAUTH_ADMIN'] === '1') return true
    reply.status(403).send({
      error: {
        code: 'ADMIN_DISABLED',
        message:
          'Admin routes disabled — set ADMIN_SECRET (or OST_ALLOW_UNAUTH_ADMIN=1 for local dev only).',
      },
    })
    return false
  }
  const provided = request.headers['x-admin-secret']
  if (typeof provided !== 'string' || !safeStrEqual(provided, expected)) {
    reply.status(403).send({
      error: { code: 'FORBIDDEN', message: 'Invalid or missing X-Admin-Secret header.' },
    })
    return false
  }
  return true
}
