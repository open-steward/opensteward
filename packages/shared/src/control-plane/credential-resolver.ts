/**
 * Deciding who a `Authorization: Bearer …` request is.
 *
 * The developer API accepts two credentials for the same surface: the static
 * `osk_` key, and — when the operator has configured an identity provider —
 * a short-lived OIDC bearer token issued by that IdP.
 * Both resolve to the same `(tenantId, principalId, scopes)` triple, so the
 * two-axis vertical scope check, tenant isolation, the MCP guards and
 * connection resolution downstream are identical either way.
 *
 * Dispatch is on the token's shape, which is unambiguous: `osk_…` and `eut_…`
 * can never be a JWT, and a JWT is always three dot-separated base64url
 * segments. A token matching neither is refused rather than guessed at.
 *
 * Either credential can be switched off by the operator
 * (`auth.dev_api_keys_enabled`, `auth.dev_oauth_enabled`), read per request so
 * a flip takes effect without a redeploy. `X-Admin-Secret` is deliberately NOT
 * gated by either — it is the operator and inter-service path, and the route
 * back into a deployment whose developer auth has been misconfigured.
 */
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { ApiKeyMode, ApiKeyStore } from '../auth/api-keys'
import type { OAuthClientStore } from '../auth/oauth-clients'
import { looksLikeJwt, verifyOAuthToken } from '../auth/oidc-verifier'
import { unverifiedIssuer } from '../auth/oauth-authority'
import { SANDBOX_ISSUER_PRESET } from '../auth/mock-oidc-issuer'
import { extractBearerToken } from './bearer-token'

export { extractBearerToken }

export type AuthMethod = 'api_key' | 'oauth'

export interface ResolvedPrincipal {
  tenantId: string
  /**
   * Stable id for the rate-limit bucket, audit and logging.
   *
   * Named `apiKeyId` for consistency with its downstream readers —
   * `request.apiKeyId` is consumed in the sync router, the end-user router,
   * integration-server's own rate-limit resolver and elsewhere. It holds the
   * principal id for either credential type.
   */
  apiKeyId: string
  scopes: string[]
  authMethod: AuthMethod
  /**
   * Live or test, for an API key. `undefined` for an OIDC token, which has no
   * such axis — an IdP issues one kind of token and the sandbox is reached
   * with a key minted `--test`.
   *
   * Carried here because this resolver owns the lookup, so `requireTenantKey`
   * is the only place that can enforce it: it guards `/v1/customers*`,
   * `/v1/connections*` and `/v1/events` as well as the vertical mounts, and a
   * sandbox key must not read any of them. Dropping it would let a test key
   * onto the live surface.
   */
  mode?: ApiKeyMode
}

/**
 * A live read of a runtime setting. A function rather than a boolean so an
 * operator's flip in the admin UI takes effect on the next settings poll,
 * matching how `features.mcp_enabled` already behaves.
 */
export type AuthToggleSource = () => boolean

export interface DeveloperCredentialOptions {
  apiKeys: ApiKeyStore
  /** Omit and OIDC bearer tokens are refused as unavailable. */
  oauth?: OAuthClientStore
  /** Live read of `auth.dev_api_keys_enabled`. Omit and keys stay enabled. */
  apiKeysEnabled?: AuthToggleSource
  /** Live read of `auth.dev_oauth_enabled`. Omit and OAuth stays disabled. */
  oauthEnabled?: AuthToggleSource
}

async function unauthenticated(reply: FastifyReply, message: string): Promise<false> {
  await reply.status(401).send({ error: { code: 'UNAUTHENTICATED', message } })
  return false
}

/**
 * Resolve the principal behind a bearer token.
 *
 * Returns the principal on success, `null` when no Authorization header was
 * sent (the caller decides whether that is allowed), and `false` when a header
 * was sent and refused — the response is already on its way.
 */
export async function resolveDeveloperCredential(
  request: FastifyRequest,
  reply: FastifyReply,
  opts: DeveloperCredentialOptions,
): Promise<ResolvedPrincipal | null | false> {
  const token = extractBearerToken(request)
  if (!token) return null

  if (looksLikeJwt(token)) {
    if (!opts.oauth || opts.oauthEnabled?.() !== true) {
      await reply.status(403).send({
        error: {
          code: 'OAUTH_DISABLED',
          message:
            'OIDC bearer tokens are not accepted by this deployment. Use an API key, or ask ' +
            'the operator to enable auth.dev_oauth_enabled.',
        },
      })
      return false
    }

    // A token from the deployment's own test issuer is a test credential and
    // belongs under /test/v1/*. Refused before verification, so the answer
    // does not depend on this server being able to fetch its own JWKS — and
    // decided by the issuer row the operator registered, not by any claim
    // the token carries. Same code a test key gets here, for the same reason.
    const iss = await unverifiedIssuer(token)
    const issuerRow = iss ? await opts.oauth.getIssuerByIss(iss) : null
    if (issuerRow?.preset === SANDBOX_ISSUER_PRESET) {
      await reply.status(403).send({
        error: {
          code: 'KEY_MODE_MISMATCH',
          message:
            "This token is from the deployment's test issuer; /v1/* requires a live credential. " +
            'Test-issuer tokens are used under /test/v1/*.',
        },
      })
      return false
    }

    const result = await verifyOAuthToken(token, opts.oauth)
    if (!result.ok) {
      // One uniform refusal to the caller. Telling a caller apart "bad
      // signature" from "subject not registered" would turn this into an
      // enumeration oracle for the operator's service accounts. The reason
      // goes to the log, where `detail` is guaranteed to carry neither the
      // token nor its claims.
      request.log.warn(
        { authMethod: 'oauth', reason: result.reason, detail: result.detail },
        'OIDC bearer token refused',
      )
      return unauthenticated(reply, 'Invalid or expired token.')
    }
    return {
      tenantId: result.principal.tenantId,
      apiKeyId: result.principal.principalId,
      scopes: result.principal.scopes,
      authMethod: 'oauth',
      // A token from the deployment's own test issuer is a test credential,
      // whatever route it arrived on — the mode check that follows refuses it
      // on /v1/* exactly as it refuses an osk_test_ key. Decided by the
      // issuer row, which the operator controls, not by a claim the token
      // could carry.
      mode: result.issuer.preset === SANDBOX_ISSUER_PRESET ? 'test' : 'live',
    }
  }

  if (opts.apiKeysEnabled && !opts.apiKeysEnabled()) {
    await reply.status(403).send({
      error: {
        code: 'API_KEYS_DISABLED',
        message:
          'API keys are not accepted by this deployment. Present an OIDC bearer token from a ' +
          'configured identity provider instead.',
      },
    })
    return false
  }

  const row = await opts.apiKeys.verify(token)
  if (!row) return unauthenticated(reply, 'Invalid or revoked API key.')
  return {
    tenantId: row.tenantId,
    apiKeyId: row.id,
    scopes: row.scopes,
    authMethod: 'api_key',
    // From the verified row, never the plaintext: the `osk_test_` marker is
    // cosmetic, and a tenant named `test` mints a live key that carries it.
    // Anything but an exact 'test' reads as live — the same normalisation
    // applied to a NULL mode column. It cannot escalate.
    mode: row.mode === 'test' ? 'test' : 'live',
  }
}
