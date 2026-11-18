/**
 * The sandbox's credential: a test API key, or a token from the deployment's
 * own test issuer.
 *
 * One resolver for every `/test/v1/*` surface — the per-vertical resource
 * middleware, the control plane (customers, connections, events,
 * webhook-subscriptions), the meta routes (connections list, reset) and the
 * sync simulator. They used to each call `resolveApiKey` themselves, which is
 * how the vertical routes learned about tokens while `GET /test/v1/connections`
 * kept answering "Invalid or revoked API key" to a perfectly good one.
 *
 * Leaf imports only: this sits in the sandbox's import graph and
 * `check:sandbox-egress` proves it network-free. The OIDC path needs no
 * fetch — the only issuer it verifies is the deployment's own, whose key is
 * in memory — and the claims→principal half of the verifier lives in
 * `oauth-authority` precisely so it can be shared without the network half.
 */
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { ApiKeyMode, ApiKeyStore } from '../auth/api-keys'
import type { OAuthClientStore } from '../auth/oauth-clients'
import { SANDBOX_ISSUER_PRESET, type MockIssuerKeys } from '../auth/mock-oidc-issuer'
import { looksLikeJwt, resolveAuthority, unverifiedIssuer } from '../auth/oauth-authority'
import { resolveApiKey } from './api-key-resolver'
import { extractBearerToken } from './bearer-token'

/**
 * Accept tokens from the deployment's own test issuer (`/test/oidc`) as well
 * as test keys. Omit and a JWT is refused as OAUTH_DISABLED. `enabled` is the
 * same `auth.dev_oauth_enabled` read `/v1/*` uses, so the two surfaces switch
 * together — an operator turning OIDC off turns it off everywhere, and
 * turning keys off on `/v1/*` still leaves test keys here.
 */
export interface SandboxOauthOptions {
  store: OAuthClientStore
  keys: MockIssuerKeys
  enabled: () => boolean
}

/** What either credential resolves to; the rest of the middleware is shared. */
export interface SandboxPrincipal {
  tenantId: string
  /** Rate-limit bucket + logging id: the key id, or the OIDC principal id. */
  apiKeyId: string
  scopes: string[]
  mode: ApiKeyMode
}

async function unauthenticated(reply: FastifyReply, message: string): Promise<null> {
  await reply.status(401).send({ error: { code: 'UNAUTHENTICATED', message } })
  return null
}

/**
 * Verify a bearer JWT against the sandbox test issuer, without egress.
 *
 * The only issuer verifiable here is the deployment's own: its `iss` must
 * resolve to a registered row carrying the sandbox preset, and its signature
 * is checked against the key held in memory. From there the claims go
 * through the same `resolveAuthority` the live verifier uses, so what a
 * token may do is decided by the operator's registry exactly as it would be
 * for a production IdP. Failures are one uniform 401 for the same reason the
 * live path gives one — the detail goes to the log.
 */
async function resolveSandboxToken(
  request: FastifyRequest,
  reply: FastifyReply,
  token: string,
  oauth: SandboxOauthOptions | undefined,
): Promise<SandboxPrincipal | null> {
  if (!oauth || !oauth.enabled()) {
    await reply.status(403).send({
      error: {
        code: 'OAUTH_DISABLED',
        message:
          'OIDC bearer tokens are not accepted by this deployment. Use a test API key, or ask ' +
          'the operator to enable auth.dev_oauth_enabled.',
      },
    })
    return null
  }
  const refuse = async (reason: string, detail: string): Promise<null> => {
    request.log.warn(
      { authMethod: 'oauth', surface: 'sandbox', reason, detail },
      'OIDC bearer token refused',
    )
    return unauthenticated(reply, 'Invalid or expired token.')
  }

  const iss = await unverifiedIssuer(token)
  if (!iss) return refuse('malformed', 'no iss claim')
  const issuer = await oauth.store.getIssuerByIss(iss)
  if (!issuer) return refuse('unknown_issuer', `no issuer registered for ${iss}`)
  if (issuer.preset !== SANDBOX_ISSUER_PRESET) {
    return refuse(
      'unknown_issuer',
      `the sandbox verifies only the deployment's own test issuer; ${issuer.name} needs /v1`,
    )
  }
  if (!issuer.enabled) return refuse('issuer_disabled', `issuer ${issuer.name} is disabled`)

  let payload
  try {
    const { jwtVerify } = await import('jose')
    const verified = await jwtVerify(token, oauth.keys.publicKey, {
      issuer: issuer.issuer,
      audience: issuer.audience,
      algorithms: [oauth.keys.alg],
    })
    payload = verified.payload
  } catch (err) {
    return refuse('signature', err instanceof Error ? err.message : String(err))
  }

  const result = await resolveAuthority(issuer, payload, oauth.store)
  if (!result.ok) return refuse(result.reason, result.detail)
  return {
    tenantId: result.principal.tenantId,
    apiKeyId: result.principal.principalId,
    scopes: result.principal.scopes,
    mode: 'test',
  }
}

/**
 * Resolve whichever test credential the request carries.
 *
 * Returns the principal, `null` when no bearer was sent (the caller says what
 * it wanted), or `false` when one was sent and refused — the response is
 * already on its way. Same contract as `resolveApiKey`, so the four callers
 * swapped one line each.
 *
 * Two credentials, one boundary. A JWT goes to the test-issuer check;
 * anything else is a key, and `expected: 'test'` is the other half of the
 * boundary — a live key here is refused exactly as a test key is on /v1/*.
 */
export async function resolveSandboxCredential(
  request: FastifyRequest,
  reply: FastifyReply,
  apiKeys: ApiKeyStore,
  oauth: SandboxOauthOptions | undefined,
): Promise<SandboxPrincipal | null | false> {
  const bearer = extractBearerToken(request)
  if (bearer && looksLikeJwt(bearer)) {
    const principal = await resolveSandboxToken(request, reply, bearer, oauth)
    return principal ?? false
  }
  return resolveApiKey(request, reply, apiKeys, 'test')
}

/** The 401 every sandbox surface sends when no credential was presented. */
export async function requireSandboxCredential(reply: FastifyReply): Promise<void> {
  await reply.status(401).send({
    error: {
      code: 'UNAUTHENTICATED',
      message:
        "Authorization: Bearer <test api key, or a token from this deployment's test issuer> is required.",
    },
  })
}
