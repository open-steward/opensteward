/**
 * OIDC / OAuth2 provider — Authorization Code + PKCE(S256), state + nonce,
 * ID-token signature & claim validation via `openid-client`.
 *
 * openid-client v6 is ESM-only; this CJS module loads it through a cached
 * dynamic import.
 */
import type { IdentityProviderRow, IdentityStore } from '../../db/identity-store'
import { OidcConfigSchema, type OidcConfig, type ResolvedIdentity } from './types'

// openid-client v6 is ESM-only. Typing `typeof import(...)` from this CJS module
// trips TS1542 under module:node16, so we load it untyped through a cached
// dynamic import and annotate our own function boundaries instead.
/* eslint-disable @typescript-eslint/no-explicit-any */
type OidcModule = any
let cached: Promise<OidcModule> | null = null
function loadOidc(): Promise<OidcModule> {
  if (!cached) cached = import('openid-client')
  return cached
}

async function discover(client: OidcModule, provider: IdentityProviderRow, clientSecret: string) {
  const cfg = OidcConfigSchema.parse(provider.config)
  const url = new URL(cfg.issuer)
  // Permit plain http ONLY for loopback issuers (local dev / integration tests).
  // A real remote IdP can never be downgraded by this.
  const options = isLoopback(url.hostname) ? { execute: [client.allowInsecureRequests] } : undefined
  return client.discovery(url, cfg.clientId, clientSecret, undefined, options)
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]'
}

/** Build the IdP authorization redirect and persist the transaction. */
export async function beginOidcLogin(
  identityStore: IdentityStore,
  provider: IdentityProviderRow,
  clientSecret: string,
  redirectUri: string,
  returnTo: string,
): Promise<string> {
  const client = await loadOidc()
  const config = await discover(client, provider, clientSecret)
  const cfg = OidcConfigSchema.parse(provider.config)

  const codeVerifier = client.randomPKCECodeVerifier()
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier)
  const state = client.randomState()
  const nonce = client.randomNonce()

  const scope = ['openid', ...cfg.scopes.split(/\s+/).filter(Boolean)]
  const uniqueScope = Array.from(new Set(scope)).join(' ')

  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri,
    scope: uniqueScope,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce,
    // Forward optional auth-context hints when the operator configured them.
    ...(cfg.prompt ? { prompt: cfg.prompt } : {}),
    ...(cfg.acrValues ? { acr_values: cfg.acrValues } : {}),
  })

  identityStore.createTransaction({
    state,
    providerId: provider.id,
    nonce,
    codeVerifier,
    returnTo,
  })

  return url.href
}

/** Validate the callback and resolve the identity. `txn` is the already-consumed
 *  transaction (carries the expected state/nonce/code_verifier). */
export async function completeOidcLogin(
  provider: IdentityProviderRow,
  clientSecret: string,
  currentUrl: string,
  txn: { nonce: string | null; codeVerifier: string | null; id: string },
): Promise<ResolvedIdentity> {
  const client = await loadOidc()
  const config = await discover(client, provider, clientSecret)
  const cfg = OidcConfigSchema.parse(provider.config)

  const tokens = await client.authorizationCodeGrant(config, new URL(currentUrl), {
    pkceCodeVerifier: txn.codeVerifier ?? undefined,
    expectedNonce: txn.nonce ?? undefined,
    expectedState: txn.id,
    idTokenExpected: true,
  })

  const claims = tokens.claims() ?? {}
  const attributes: Record<string, unknown> = { ...claims }

  // Fetch userinfo to enrich group claims when present at that endpoint.
  if (typeof claims.sub === 'string' && tokens.access_token) {
    try {
      const userinfo = await client.fetchUserInfo(config, tokens.access_token, claims.sub)
      Object.assign(attributes, userinfo)
    } catch {
      // userinfo is best-effort; ID-token claims already validated
    }
  }

  return identityFromOidcClaims(claims, attributes, cfg)
}

/**
 * `email_verified` as a boolean. Some IdPs (Cognito among them) send a
 * string, in any case: `"False"` and `"FALSE"` are false. Anything else —
 * including an absent claim — is `null`, which the profile sync treats as
 * verified (docs/architecture/sso-and-identity-providers.md).
 */
function verifiedFlag(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return null
  const v = value.trim().toLowerCase()
  if (v === 'true') return true
  if (v === 'false') return false
  return null
}

/**
 * Map validated ID-token claims plus (best-effort) userinfo onto the
 * protocol-neutral identity. `attributes` is the merge of both, userinfo
 * winning, and is mutated to normalise the groups claim.
 */
export function identityFromOidcClaims(
  claims: Record<string, unknown>,
  attributes: Record<string, unknown>,
  cfg: Pick<OidcConfig, 'groupsClaim'>,
): ResolvedIdentity {
  const sub = typeof claims.sub === 'string' ? claims.sub : null
  if (!sub) throw new Error('OIDC response missing subject (sub) claim')

  // The ID token's claim first; userinfo only when the token omitted it (the
  // `email` scope's claims may be served by userinfo alone).
  const email =
    (typeof claims.email === 'string' && claims.email) ||
    (typeof attributes.email === 'string' && (attributes.email as string)) ||
    null
  const emailVerified = verifiedFlag(
    typeof claims.email === 'string' ? claims.email_verified : attributes.email_verified,
  )
  const pictureUrl =
    (typeof attributes.picture === 'string' && (attributes.picture as string)) ||
    (typeof claims.picture === 'string' && claims.picture) ||
    null
  const displayName =
    (typeof claims.name === 'string' && claims.name) ||
    (typeof attributes.preferred_username === 'string' && (attributes.preferred_username as string)) ||
    null

  // Normalise the groups claim to the configured key so role mapping is uniform.
  if (cfg.groupsClaim in attributes && cfg.groupsClaim !== 'groups') {
    attributes.groups = attributes[cfg.groupsClaim]
  }

  return { externalId: sub, email, emailVerified, displayName, pictureUrl, attributes }
}
