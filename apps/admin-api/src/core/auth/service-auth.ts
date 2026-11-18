/**
 * Service-to-service authentication, the mirror of `adminGuard`.
 *
 * admin-api already authenticates *to* integration-server with a shared
 * secret in `X-Admin-Secret`. Nothing went the other way, so
 * integration-server's 60-second settings poll — which needs the operator's
 * tuned rate limits and feature flags — had no credential to present.
 * `requireAuth` here is `jwtVerify()`, and integration-server holds no
 * `JWT_SECRET` on purpose: that key signs admin *user* sessions, so a service
 * holding it could mint itself an admin token.
 *
 * Hence a second, distinct secret. Distinct rather than reusing
 * `ADMIN_SECRET`, because one secret guarding both directions means a
 * compromise of either service opens both paths.
 *
 * Unlike `adminGuard`, this never falls open when unconfigured. That guard
 * lets requests through in non-production when its secret is unset, which is
 * what allowed script on a CORS-allowed origin to read admin JSON in local
 * dev. Absent secret here means the door is shut, in every environment.
 */
import type { FastifyReply, FastifyRequest } from 'fastify'
import { safeStrEqual } from '@opensteward/shared'
import { tagGuard } from './route-access'

export const SERVICE_SECRET_HEADER = 'x-service-secret'

/** Minimum length for a usable secret; shorter values are treated as unset. */
const MIN_SECRET_LENGTH = 16

export function serviceGuard(
  request: FastifyRequest,
  reply: FastifyReply,
  done: () => void,
): void {
  const expected = (process.env['SERVICE_SECRET'] ?? '').trim()
  const presented = String(request.headers[SERVICE_SECRET_HEADER] ?? '').trim()

  if (expected.length < MIN_SECRET_LENGTH || !presented || !safeStrEqual(presented, expected)) {
    void reply.status(401).send({
      error: 'Unauthorized — missing or invalid service credential',
    })
    return
  }
  done()
}
tagGuard(serviceGuard, { kind: 'service' })

/** True when the request carries the configured service secret. */
export function hasServiceSecret(request: FastifyRequest): boolean {
  const expected = (process.env['SERVICE_SECRET'] ?? '').trim()
  const presented = String(request.headers[SERVICE_SECRET_HEADER] ?? '').trim()
  return expected.length >= MIN_SECRET_LENGTH && !!presented && safeStrEqual(presented, expected)
}

/**
 * Admits either a signed-in operator or a sibling service.
 *
 * Routes the admin UI reads and a service also needs — the runtime-settings
 * list — take this instead of `authenticate`, so neither caller needs the
 * other's credential. A request with no service secret falls through to the
 * ordinary JWT check, so operator access is unchanged and unauthenticated
 * callers still get the same 401 they did before.
 */
export function jwtOrServiceAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  done: () => void,
): void {
  if (hasServiceSecret(request)) {
    done()
    return
  }
  request
    .jwtVerify()
    .then(() => done())
    .catch(() => {
      void reply.status(401).send({ error: 'Unauthorized — invalid or missing JWT token' })
    })
}
tagGuard(jwtOrServiceAuth, { kind: 'jwt-or-service' })
