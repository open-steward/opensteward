/**
 * The two-axis vertical scope check.
 *
 * A leaf module, like `api-key-resolver`: the sandbox applies this rule, and
 * `auth-middleware` reaches the network through `credential-resolver` →
 * `oidc-verifier`. `check:sandbox-egress` walks imports rather than calls, so
 * this module must depend on nothing that can open a socket.
 */
import type { FastifyReply, FastifyRequest } from 'fastify'
import { hasScope } from '../auth/api-keys'

/**
 * Whether a request needs `vertical:write`, given its method and the route's
 * Fastify config.
 *
 * The verb is the default rule — anything that is not a read is a write — but a
 * route may declare `config: { readSafe: true }` to opt out. That exists for
 * `POST /v1/{vertical}/sync`, which is a POST because it enqueues a job, not
 * because it changes anything on the platform: the worker only lists upstream
 * resources and upserts them into the local store. Gating it behind
 * `vertical:write` would mean the recommended API-key preset (which omits
 * that scope by design) could read a vertical's data but never refresh it.
 *
 * The flag must be exactly `true`. Config plumbing that produced a truthy
 * string would otherwise quietly turn a write route into a read one.
 */
export function requiresWriteScope(
  method: string,
  routeConfig: { readSafe?: unknown } | undefined,
): boolean {
  if (method === 'GET' || method === 'HEAD') return false
  return routeConfig?.readSafe !== true
}

/**
 * The two-axis vertical scope check: a touch axis (may this key see the
 * vertical at all?) and a verb axis (may it write?). Sends the 403 and returns
 * false when either fails, so callers read as
 * `if (!(await assertVerticalScopes(...))) return`.
 *
 * Extracted rather than inlined because the sandbox mount needs the identical
 * rule. A copy would let a future change apply to one surface and not the
 * other, which is the kind of drift that turns into a scope bypass.
 *
 * `basePath` only shapes the message — the rule is the same on both surfaces.
 */
export async function assertVerticalScopes(
  request: FastifyRequest,
  reply: FastifyReply,
  vertical: string,
  basePath = '/v1',
): Promise<boolean> {
  const grants = (request as unknown as { apiKeyScopes?: string[] }).apiKeyScopes ?? []
  const verticalScope = `vertical:${vertical}`
  const hasTouch =
    hasScope(grants, verticalScope) ||
    hasScope(grants, 'vertical:read') ||
    hasScope(grants, 'vertical:write')
  if (!hasTouch) {
    await reply.status(403).send({
      error: {
        code: 'INSUFFICIENT_SCOPE',
        message: `This API key is missing required scope '${verticalScope}' (or 'vertical:read' / 'vertical:write').`,
        requiredScope: verticalScope,
      },
    })
    return false
  }
  const isWrite = requiresWriteScope(
    request.method,
    request.routeOptions?.config as { readSafe?: unknown } | undefined,
  )
  if (isWrite && !hasScope(grants, 'vertical:write')) {
    await reply.status(403).send({
      error: {
        code: 'INSUFFICIENT_SCOPE',
        message: `'vertical:write' scope required to mutate ${basePath}/${vertical}/* data.`,
        requiredScope: 'vertical:write',
      },
    })
    return false
  }
  return true
}

/** A license refusal for a write on one connection: the structured error, sent as `{ error }`. */
export type ConnectionWriteRefusal = { code: string; message: string } & Record<string, unknown>

/**
 * Asked before every write (`requiresWriteScope`) on a connection, the admin
 * secret included. Returns the refusal to send with a 403, or null to let the
 * write through. integration-server installs the license's read-only overflow
 * here (P6); without one, nothing changes.
 */
export type ConnectionWriteGuard = (connectionId: string) => Promise<ConnectionWriteRefusal | null>
