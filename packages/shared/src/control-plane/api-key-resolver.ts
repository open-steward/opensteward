/**
 * Resolving an `osk_` API key, and the live/test boundary that goes with it.
 *
 * A leaf module so the SANDBOX can use it: `api-key-middleware` imports
 * `credential-resolver` for the OIDC path, which reaches
 * `oidc-verifier` → `safe-fetch`; `check:sandbox-egress` walks imports rather
 * than calls, so the sandbox importing it at all is a failure even though the
 * sandbox never takes that branch. This module deliberately depends on nothing
 * that can open a socket.
 */
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { ApiKeyMode, ApiKeyStore } from '../auth/api-keys'
import { extractBearerToken } from './bearer-token'

/** Base path a given key mode is addressed at, for the mismatch message. */
const MODE_BASE_PATH: Record<ApiKeyMode, string> = { live: '/v1', test: '/test/v1' }

/**
 * Refuse a key presented on the wrong surface.
 *
 * One implementation because two callers need it: `resolveApiKey`, which the
 * sandbox mount and the headless connect route use directly, and
 * `requireTenantKey`, which resolves through `resolveDeveloperCredential`
 * and would otherwise have no mode check at all.
 */
export async function refuseKeyModeMismatch(
  reply: FastifyReply,
  actual: ApiKeyMode,
  expected: ApiKeyMode,
): Promise<false> {
  await reply.status(403).send({
    error: {
      code: 'KEY_MODE_MISMATCH',
      message:
        `This is a ${actual} key; ${MODE_BASE_PATH[expected]}/* requires a ` +
        `${expected} key. ${actual} keys are used under ${MODE_BASE_PATH[actual]}/*.`,
    },
  })
  return false
}

/**
 * Resolve the tenant for the current request. Returns the tenantId when a
 * valid key is supplied, or `null` when no Authorization header was sent.
 * Sends a 401 and returns `false` when a header was sent but invalid.
 *
 * `expected` is the key mode this surface accepts, and **defaults to `'live'`
 * deliberately**. Every caller that does not opt in is therefore live-only,
 * which is what closes the interesting hole: the mode check cannot live in the
 * per-vertical middleware alone, because `requireTenantKey` also guards
 * `/v1/customers*`, `/v1/connections*` and `/v1/events`. A check placed only on
 * the vertical mount would leave a sandbox key able to read live customers,
 * connections and inbound events. Defaulting here means those three — and any
 * route added later — inherit the refusal for free.
 *
 * The mode comes from the verified DB row, never from the plaintext: the
 * `osk_test_` marker is cosmetic, and a tenant named `test` mints a live key
 * that carries it.
 *
 * A row carrying no mode at all reads as `'live'` — the same normalisation
 * `ApiKeyStore.parseMode` applies to a NULL column, and the natural behaviour
 * for an embedder-supplied key store with no mode column. It cannot escalate:
 * only an exact `'test'` opens `/test/v1/*`.
 */
export async function resolveApiKey(
  request: FastifyRequest,
  reply: FastifyReply,
  apiKeys: ApiKeyStore,
  expected: ApiKeyMode = 'live',
): Promise<
  { tenantId: string; apiKeyId: string; scopes: string[]; mode: ApiKeyMode } | null | false
> {
  const token = extractBearerToken(request)
  if (!token) return null
  const row = await apiKeys.verify(token)
  if (!row) {
    await reply.status(401).send({
      error: { code: 'UNAUTHENTICATED', message: 'Invalid or revoked API key.' },
    })
    return false
  }
  const mode: ApiKeyMode = row.mode === 'test' ? 'test' : 'live'
  if (mode !== expected) return refuseKeyModeMismatch(reply, mode, expected)
  return { tenantId: row.tenantId, apiKeyId: row.id, scopes: row.scopes, mode }
}
