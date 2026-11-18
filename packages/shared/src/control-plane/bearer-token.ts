/**
 * Pulling the bearer token off a request. Nothing else.
 *
 * A leaf module on purpose. Both the API-key path and the OIDC path need it,
 * but the OIDC path reaches the network (`oidc-verifier` → `safe-fetch`), and
 * the sandbox must not be able to reach the network at all —
 * `check:sandbox-egress` walks the import graph, not the call graph, so a
 * module that merely *can* is a failure. Keeping this dependency-free is what
 * lets the sandbox share it without inheriting that.
 */
import type { FastifyRequest } from 'fastify'

/** Extract the bearer token from a request, or `null` if absent / malformed. */
export function extractBearerToken(request: FastifyRequest): string | null {
  const raw = request.headers['authorization']
  const header = Array.isArray(raw) ? raw[0] : raw
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match ? match[1].trim() : null
}
