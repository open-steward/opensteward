/**
 * Verifying an OIDC bearer token presented by a developer on `/v1/*`.
 *
 * OpenSteward is only a RESOURCE SERVER here. It never mints these tokens and
 * never sees a client secret — verification needs the issuer's published
 * public keys and nothing else. A developer's app gets a token from the
 * operator's own IdP (Keycloak, Auth0, Okta, Entra ID) by whatever grant that
 * IdP offers, and presents it exactly where an `osk_` key would go.
 *
 * The result is the same `(tenantId, principalId, scopes)` triple an API key
 * produces, so everything downstream — the two-axis vertical scope check,
 * tenant isolation, the MCP guards, connection resolution — is untouched.
 *
 * `jose` is ESM-only and this package compiles to CommonJS, so it is loaded
 * with a dynamic `import()`, the same way `kysely` is in `../db/sqlite.ts`.
 */
import type { JWTPayload } from 'jose' with { 'resolution-mode': 'import' }
import { safeFetch } from '../net/safe-fetch'
import type { OAuthClientStore } from './oauth-clients'
import {
  joseErrorReason,
  looksLikeJwt,
  resolveAuthority,
  unverifiedIssuer,
  type VerifyResult,
} from './oauth-authority'

// The claims→principal half lives in oauth-authority.ts (network-free, so the
// sandbox can share it); re-exported here so callers keep one import.
export { looksLikeJwt, mapTokenScopes, resolveAuthority } from './oauth-authority'
export type { OAuthPrincipal, VerifyFailureReason, VerifyResult } from './oauth-authority'

/** Seconds of clock skew tolerated on `exp`/`nbf`. */
const CLOCK_TOLERANCE_S = 30

/** Largest discovery document we will read, in characters. */
const MAX_DISCOVERY_BYTES = 1_000_000

/**
 * Vendor presets. Data, not code — adding Cognito or Google later is a row.
 *
 * Only the claim names differ; the verifier itself is identical for every
 * issuer, because all four speak the same standard. `issuerHint` is shown in
 * the admin form, never used for matching.
 */
export interface IssuerPreset {
  id: string
  label: string
  issuerHint: string
  subjectClaim: string
  scopeClaim: string
  /** Shown beside the issuer field when this preset is chosen. */
  note?: string
}

export const ISSUER_PRESETS: readonly IssuerPreset[] = [
  {
    id: 'keycloak',
    label: 'Keycloak',
    issuerHint: 'https://{host}/realms/{realm}',
    subjectClaim: 'azp',
    scopeClaim: 'realm_access.roles',
    note:
      "realm_access.roles also carries Keycloak's own bookkeeping roles — default-roles-{realm}, " +
      'offline_access, uma_authorization — alongside yours. Registry and intersect modes ignore ' +
      'them; in token-decides mode, add scope rules so only the roles you mean are honoured. ' +
      'Audience needs an explicit audience mapper on the client: without one the token carries ' +
      'only "account" and will be refused.',
  },
  {
    id: 'auth0',
    label: 'Auth0',
    issuerHint: 'https://{tenant}.auth0.com/',
    subjectClaim: 'azp',
    scopeClaim: 'scope',
    note: 'The issuer has a trailing slash. Audience is the API Identifier you set on the Auth0 API, not the client id.',
  },
  {
    id: 'okta',
    label: 'Okta',
    issuerHint: 'https://{org}.okta.com/oauth2/{authorizationServerId}',
    subjectClaim: 'cid',
    scopeClaim: 'scp',
  },
  {
    id: 'entra-id',
    label: 'Microsoft Entra ID',
    issuerHint: 'https://login.microsoftonline.com/{tenantId}/v2.0',
    subjectClaim: 'azp',
    scopeClaim: 'roles',
    note:
      'A v1.0 token carries iss=https://sts.windows.net/{tenantId}/ even when the v2.0 endpoint ' +
      'is configured, and will be rejected. Set "accessTokenAcceptedVersion": 2 on the app ' +
      'manifest, or register the v1.0 issuer instead.',
  },
  {
    id: 'generic',
    label: 'Generic OIDC',
    issuerHint: 'https://…',
    subjectClaim: 'sub',
    scopeClaim: 'scope',
  },
  {
    // The deployment's own test issuer (/test/oidc). Its tokens are the OIDC
    // counterpart of osk_test_ keys: accepted on /test/v1/*, refused on /v1/*.
    // Registering it here is what lets the registry / intersect / token-decides
    // configuration be rehearsed against the sandbox before a real IdP exists.
    id: 'sandbox',
    label: 'OpenSteward test issuer (sandbox)',
    issuerHint: 'http://<integration-server public base>/test/oidc',
    subjectClaim: 'sub',
    scopeClaim: 'scope',
    note:
      'This deployment mints these tokens itself: POST {issuer}/token with grant_type=client_credentials, ' +
      'client_id=<subject> and client_secret=<a test API key>. They work on /test/v1/* only — /v1/* refuses ' +
      "them like a test key — and the tenant claim (`tenant`) is always the key's tenant. Plain http is " +
      'accepted for this preset; nothing is fetched from it.',
  },
]

export function findPreset(id: string): IssuerPreset | undefined {
  return ISSUER_PRESETS.find((p) => p.id === id)
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

export class DiscoveryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DiscoveryError'
  }
}

/**
 * Fetch an issuer's discovery document and return the values worth storing.
 *
 * The URL is operator-supplied, which makes this an SSRF sink — it goes
 * through `safeFetch`, which re-resolves the host and re-checks every redirect
 * hop so it cannot be walked into `169.254.169.254` or a sibling service.
 *
 * The document's own `issuer` must equal what was typed. RFC 8414 requires it,
 * and without the check a misconfigured or hostile discovery endpoint could
 * point the deployment at signing keys belonging to somebody else.
 */
export async function discoverIssuer(
  issuerUrl: string,
): Promise<{ issuer: string; jwksUri: string }> {
  const base = issuerUrl.endsWith('/') ? issuerUrl : `${issuerUrl}/`
  const url = `${base}.well-known/openid-configuration`

  let res: Response
  try {
    res = await safeFetch(url, { headers: { accept: 'application/json' } })
  } catch (err) {
    throw new DiscoveryError(
      `Could not reach ${url}: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
  if (!res.ok) {
    throw new DiscoveryError(`${url} returned ${res.status}.`)
  }

  const text = await res.text()
  if (text.length > MAX_DISCOVERY_BYTES) {
    throw new DiscoveryError(`Discovery document at ${url} is implausibly large.`)
  }

  let doc: { issuer?: unknown; jwks_uri?: unknown }
  try {
    doc = JSON.parse(text) as { issuer?: unknown; jwks_uri?: unknown }
  } catch {
    throw new DiscoveryError(`${url} did not return JSON.`)
  }

  if (typeof doc.issuer !== 'string' || doc.issuer !== issuerUrl) {
    throw new DiscoveryError(
      `Discovery document reports issuer "${String(doc.issuer)}", but "${issuerUrl}" was ` +
        `configured. Tokens carry the value the document reports, so register that instead.`,
    )
  }
  if (typeof doc.jwks_uri !== 'string' || doc.jwks_uri.length === 0) {
    throw new DiscoveryError(`Discovery document at ${url} has no jwks_uri.`)
  }

  return { issuer: doc.issuer, jwksUri: doc.jwks_uri }
}

// ---------------------------------------------------------------------------
// JWKS cache
// ---------------------------------------------------------------------------

// One key-set resolver per JWKS URI, reused across requests. jose owns the
// caching, the `kid` rotation and — the part that matters here — the refetch
// cooldown, which is what stops a stream of tokens bearing unknown `kid`s from
// turning every request into an outbound fetch.
type KeyResolver = (protectedHeader: unknown, token: unknown) => Promise<CryptoKey | Uint8Array>

const jwksCache = new Map<string, KeyResolver>()

/** Drop cached key resolvers. Tests, and any change to an issuer's JWKS URI. */
export function resetJwksCache(jwksUri?: string): void {
  if (jwksUri) jwksCache.delete(jwksUri)
  else jwksCache.clear()
}

async function getKeyResolver(jwksUri: string): Promise<KeyResolver> {
  const cached = jwksCache.get(jwksUri)
  if (cached) return cached
  const { createRemoteJWKSet, customFetch } = await import('jose')
  const resolver = createRemoteJWKSet(new URL(jwksUri), {
    // Same SSRF reasoning as discovery: the JWKS URI came from a document at
    // an operator-supplied host, so it is not trusted to be public.
    [customFetch]: ((url: string, options: RequestInit) => safeFetch(url, options)) as never,
  }) as unknown as KeyResolver
  jwksCache.set(jwksUri, resolver)
  return resolver
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/**
 * Verify a bearer token and resolve the authority it carries.
 *
 * Callers MUST NOT put `detail` in an HTTP response. Every failure is one
 * `401 UNAUTHENTICATED` to the caller — distinguishing "bad signature" from
 * "subject not registered" would turn this into an enumeration oracle for the
 * operator's service accounts. `detail` exists for the server log, and it
 * never contains the token or its claims.
 */
export async function verifyOAuthToken(
  token: string,
  store: OAuthClientStore,
): Promise<VerifyResult> {
  if (!looksLikeJwt(token)) {
    return { ok: false, reason: 'malformed', detail: 'not a JWT' }
  }

  const iss = await unverifiedIssuer(token)
  if (!iss) return { ok: false, reason: 'malformed', detail: 'no iss claim' }

  const issuer = await store.getIssuerByIss(iss)
  if (!issuer)
    return { ok: false, reason: 'unknown_issuer', detail: `no issuer registered for ${iss}` }
  if (!issuer.enabled) {
    return { ok: false, reason: 'issuer_disabled', detail: `issuer ${issuer.name} is disabled` }
  }

  let payload: JWTPayload
  try {
    const { jwtVerify } = await import('jose')
    const keys = await getKeyResolver(issuer.jwksUri)
    const result = await jwtVerify(token, keys as never, {
      issuer: issuer.issuer,
      // Mandatory, and validated as non-blank at save time. Without it any
      // token this issuer minted for any application would authenticate here.
      audience: issuer.audience,
      // Pinned to the issuer's asymmetric set. Never `none`, never HS*.
      algorithms: [...issuer.algorithms],
      clockTolerance: CLOCK_TOLERANCE_S,
    })
    payload = result.payload
  } catch (err) {
    return { ok: false, ...joseErrorReason(err) }
  }

  return resolveAuthority(issuer, payload, store)
}
