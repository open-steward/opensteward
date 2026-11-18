/**
 * Turning verified OIDC claims into an OpenSteward principal.
 *
 * Split from `oidc-verifier.ts` so the sandbox can use it: the verifier
 * reaches `safe-fetch` for JWKS and discovery, and `check:sandbox-egress`
 * walks the import graph, so anything the sandbox imports must not touch
 * this file's network half. Everything here is pure — claims in, principal
 * out, with the issuer's registry consulted through the store (a database
 * read, never a request).
 *
 * `verifyOAuthToken` (live `/v1/*`) and the sandbox's own verifier both end
 * in `resolveAuthority`, so the three authority modes behave identically on
 * both surfaces: a service account registered for the sandbox test issuer is
 * resolved exactly as one registered for a production IdP.
 */
import type { JWTPayload } from 'jose' with { 'resolution-mode': 'import' }
import { hasScope, assertMcpScopesCompatible } from './api-keys'
import { parseScopeClaim, readSingleClaim } from './claims'
import type { OAuthClientStore, OAuthIssuerRow, OAuthScopeRuleRow } from './oauth-clients'

export type VerifyFailureReason =
  | 'malformed'
  | 'unknown_issuer'
  | 'issuer_disabled'
  | 'signature'
  | 'claims'
  | 'jwks_unavailable'
  | 'token_lifetime'
  | 'no_subject'
  | 'unregistered_client'
  | 'tenant_claim_missing'
  | 'tenant_not_allowed'
  | 'no_scopes'
  | 'incompatible_scopes'

export interface OAuthPrincipal {
  tenantId: string
  /** Stable id for the rate-limit bucket, the audit actor and logging. */
  principalId: string
  scopes: string[]
  issuerId: string
  subject: string
}

export type VerifyResult =
  | { ok: true; principal: OAuthPrincipal; issuer: OAuthIssuerRow }
  | { ok: false; reason: VerifyFailureReason; detail: string }

/**
 * Cheap shape test used to route a bearer token to this verifier rather than
 * to `ApiKeyStore.verify`. Three dot-separated base64url segments — which
 * `osk_…` and `eut_…` can never be, so the dispatch is unambiguous.
 */
export function looksLikeJwt(token: string): boolean {
  const parts = token.split('.')
  if (parts.length !== 3) return false
  return parts.every((p) => p.length > 0 && /^[A-Za-z0-9_-]+$/.test(p))
}

/**
 * Read `iss` out of a token WITHOUT verifying it, only to decide which issuer
 * row to verify against. Nothing is trusted from this — the row it selects
 * supplies the expected issuer, audience and key set, and a token whose `iss`
 * does not survive real verification is rejected a few lines later.
 */
export async function unverifiedIssuer(token: string): Promise<string | null> {
  try {
    const { decodeJwt } = await import('jose')
    const claims = decodeJwt(token)
    return typeof claims.iss === 'string' && claims.iss.length > 0 ? claims.iss : null
  } catch {
    return null
  }
}

export function joseErrorReason(err: unknown): { reason: VerifyFailureReason; detail: string } {
  const code = (err as { code?: string } | null)?.code ?? ''
  const message = err instanceof Error ? err.message : String(err)
  switch (code) {
    case 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED':
    case 'ERR_JWS_INVALID':
    case 'ERR_JWT_INVALID':
      return { reason: 'signature', detail: message }
    case 'ERR_JOSE_ALG_NOT_ALLOWED':
      // The algorithm-confusion case lands here: an HS256 token signed with
      // the issuer's public key never reaches key resolution.
      return { reason: 'signature', detail: `algorithm refused: ${message}` }
    case 'ERR_JWKS_NO_MATCHING_KEY':
      return { reason: 'signature', detail: 'no key in the JWKS matches the token kid' }
    case 'ERR_JWKS_TIMEOUT':
    case 'ERR_JWKS_INVALID':
      return { reason: 'jwks_unavailable', detail: message }
    case 'ERR_JWT_EXPIRED':
    case 'ERR_JWT_CLAIM_VALIDATION_FAILED':
    case 'ERR_JWT_NOT_YET_VALID':
      return { reason: 'claims', detail: message }
    default:
      return { reason: 'signature', detail: message }
  }
}

/**
 * Map the token's own scope values onto OpenSteward scopes.
 *
 * With no rules configured the claim passes through verbatim, which is what
 * an operator willing to emit `vertical:accounting` from their IdP wants.
 * With rules, only mapped values survive — an unmapped value is dropped, never
 * passed through raw, so a rule set cannot be partially bypassed by inventing
 * a scope name.
 */
export function mapTokenScopes(
  tokenScopes: readonly string[],
  rules: readonly OAuthScopeRuleRow[],
): string[] {
  if (rules.length === 0) return [...tokenScopes]
  const out = new Set<string>()
  for (const value of tokenScopes) {
    for (const rule of rules) {
      if (rule.claimValue === value) out.add(rule.grantedScope)
    }
  }
  return [...out]
}

/**
 * Turn verified claims into a principal, by whichever route the operator chose
 * for this issuer.
 *
 * Exported for tests, which drive the three modes without minting real tokens.
 */
export async function resolveAuthority(
  issuer: OAuthIssuerRow,
  payload: JWTPayload,
  store: OAuthClientStore,
): Promise<VerifyResult> {
  const claims = payload as unknown as Record<string, unknown>

  const subject = readSingleClaim(claims, issuer.subjectClaim)
  if (!subject) {
    return {
      ok: false,
      reason: 'no_subject',
      detail: `claim ${issuer.subjectClaim} is absent, empty or ambiguous`,
    }
  }

  const tokenScopes = parseScopeClaim(claims, issuer.scopeClaim)

  let tenantId: string
  let principalId: string
  let scopes: string[]
  let clientId: string | null = null

  if (issuer.authorityMode === 'external') {
    // The IdP decides. Two rails, because a leaked token cannot be revoked and
    // the tenant now arrives inside it.
    const lifetimeFailure = checkTokenLifetime(payload, issuer.maxTokenLifetimeS)
    if (lifetimeFailure) return lifetimeFailure

    if (!issuer.tenantClaim) {
      return {
        ok: false,
        reason: 'tenant_claim_missing',
        detail: 'external authority mode with no tenant claim configured',
      }
    }
    const claimed = readSingleClaim(claims, issuer.tenantClaim)
    if (!claimed) {
      return {
        ok: false,
        reason: 'tenant_claim_missing',
        detail: `claim ${issuer.tenantClaim} is absent, empty or ambiguous`,
      }
    }
    // An empty allow-list admits nobody. Defaulting open here would let any
    // token name any tenant, which is cross-tenant read access.
    if (!issuer.allowedTenants.includes(claimed)) {
      return {
        ok: false,
        reason: 'tenant_not_allowed',
        detail: `issuer ${issuer.name} may not assert tenant "${claimed}"`,
      }
    }
    tenantId = claimed
    principalId = `oauth:${issuer.id}:${subject}`
    scopes = mapTokenScopes(tokenScopes, await store.listRules(issuer.id))
  } else {
    const client = await store.getClientBySubject(issuer.id, subject)
    if (!client) {
      return {
        ok: false,
        reason: 'unregistered_client',
        detail: `no client registered for subject on issuer ${issuer.name}`,
      }
    }
    clientId = client.id
    tenantId = client.tenantId
    principalId = `oauth_client:${client.id}`
    if (issuer.authorityMode === 'intersect') {
      // The row is the ceiling; the token may narrow it. Expressed through
      // hasScope so wildcards on the row behave, and so the result can never
      // widen past what the row already granted.
      const mapped = mapTokenScopes(tokenScopes, await store.listRules(issuer.id))
      scopes = mapped.filter((s) => hasScope(client.scopes, s))
    } else {
      scopes = client.scopes
    }
  }

  if (scopes.length === 0) {
    // An authenticated principal with no authority would 403 on every route.
    // Refusing here says so once, with a reason in the log, instead of leaving
    // the operator to guess from a wall of 403s.
    return {
      ok: false,
      reason: 'no_scopes',
      detail: `no scopes resolved in ${issuer.authorityMode} mode`,
    }
  }

  if (issuer.authorityMode !== 'registry') {
    // Registry rows are checked when saved. Anywhere the token influenced the
    // scope set, the same guard has to run here — a row granting `*` under
    // `intersect` would otherwise let one token assert `mcp:read` alongside a
    // write scope, which is exactly what the mint-time check forbids.
    try {
      assertMcpScopesCompatible(scopes)
    } catch (err) {
      return {
        ok: false,
        reason: 'incompatible_scopes',
        detail: err instanceof Error ? err.message : String(err),
      }
    }
  }

  // Best-effort bookkeeping; never fails the request.
  try {
    if (clientId) await store.touchClient(clientId)
    if (issuer.lastVerifiedAt === null) await store.markVerified(issuer.id)
  } catch {
    // A read-only replica or a locked database must not turn a valid token
    // into a 401.
  }

  return {
    ok: true,
    issuer,
    principal: { tenantId, principalId, scopes, issuerId: issuer.id, subject },
  }
}

/**
 * Refuse a token whose own lifetime exceeds what the issuer allows.
 *
 * Only enforced in `external` mode, and only there because that is the mode
 * with no revocation: the token is live until it expires no matter what the
 * operator does, so its lifetime is the only lever left. `registry` and
 * `intersect` do not need it — deleting the client row cuts a long-lived token
 * off immediately.
 *
 * A token with no `iat` cannot be bounded, so it is refused. Every real IdP
 * sets one; treating the absence as "unlimited" would make the rail optional
 * for whoever mints the token.
 */
export function checkTokenLifetime(
  payload: JWTPayload,
  maxLifetimeS: number,
): { ok: false; reason: VerifyFailureReason; detail: string } | null {
  const { iat, exp } = payload
  if (typeof iat !== 'number' || typeof exp !== 'number') {
    return {
      ok: false,
      reason: 'token_lifetime',
      detail: 'token has no iat/exp, so its lifetime cannot be bounded',
    }
  }
  const lifetime = exp - iat
  if (lifetime > maxLifetimeS) {
    return {
      ok: false,
      reason: 'token_lifetime',
      detail: `token lifetime ${lifetime}s exceeds the issuer maximum of ${maxLifetimeS}s`,
    }
  }
  return null
}
