/**
 * A minimal OIDC issuer, for exercising the bearer-token path without an
 * identity provider.
 *
 * Two hosts share it:
 *
 *   - The **sandbox test issuer**, mounted by integration-server under
 *     `/test/oidc`. Its tokens are the OIDC counterpart of `osk_test_` keys:
 *     minted by the deployment itself, accepted on `/test/v1/*`, refused on
 *     `/v1/*`. An operator registers it on /oauth-clients like any IdP (preset
 *     "sandbox"), registers service accounts against it, and the sandbox
 *     resolves those tokens through the same registry / intersect /
 *     token-decides model production uses — so the whole flow can be
 *     rehearsed before a real IdP is involved.
 *   - `scripts/dev-oidc-issuer.ts`, a standalone process standing in for a
 *     real IdP so the live `/v1/*` path can be tested end to end on a
 *     developer machine.
 *
 * Keys are generated in memory at start; nothing is persisted. A restart
 * invalidates every token minted before it, which for a test credential with
 * a one-hour life is the right trade. Holds no DOM, no network and no store —
 * `check:sandbox-egress` walks into this file from the sandbox routers.
 */
import type { JWK } from 'jose' with { 'resolution-mode': 'import' }

/** The `preset` an issuer row carries when it is this deployment's own test issuer. */
export const SANDBOX_ISSUER_PRESET = 'sandbox'

/** Where integration-server mounts the sandbox test issuer, under the public base URL. */
export const SANDBOX_ISSUER_PATH = '/test/oidc'

/**
 * Claim marking a token as test-mode. Read by the live resolver, which refuses
 * such tokens on `/v1/*` the way it refuses a test key — the same boundary,
 * enforced from inside the token rather than by which route it arrived on.
 */
export const MOCK_MODE_CLAIM = 'ost_mode'

export const MOCK_ALG = 'RS256'

export interface MockIssuerKeys {
  kid: string
  alg: typeof MOCK_ALG
  privateKey: CryptoKey
  publicKey: CryptoKey
  publicJwk: JWK
}

export async function createMockIssuerKeys(kid = 'sandbox-1'): Promise<MockIssuerKeys> {
  const { generateKeyPair, exportJWK } = await import('jose')
  const pair = await generateKeyPair(MOCK_ALG, { extractable: true })
  const publicJwk: JWK = { ...(await exportJWK(pair.publicKey)), kid, alg: MOCK_ALG, use: 'sig' }
  return { kid, alg: MOCK_ALG, privateKey: pair.privateKey, publicKey: pair.publicKey, publicJwk }
}

/** The document served at `{issuer}/jwks`. */
export function jwksDocument(keys: MockIssuerKeys): { keys: JWK[] } {
  return { keys: [keys.publicJwk] }
}

/**
 * The document served at `{issuer}/.well-known/openid-configuration`. Enough
 * for the /oauth-clients "Test" button (which reads `jwks_uri`) and for a
 * client library to find the token endpoint.
 */
export function discoveryDocument(issuer: string): Record<string, unknown> {
  return {
    issuer,
    jwks_uri: `${issuer}/jwks`,
    token_endpoint: `${issuer}/token`,
    grant_types_supported: ['client_credentials'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
    response_types_supported: ['token'],
    id_token_signing_alg_values_supported: [MOCK_ALG],
    subject_types_supported: ['public'],
  }
}

export interface MintInput {
  /** Must equal the issuer URL the operator registered — verified against `iss`. */
  issuer: string
  /** Must equal the registered issuer's audience. */
  audience: string
  /** Lands in both `sub` and `azp`, so presets keyed on either claim match. */
  subject: string
  /** Space-joined into `scope`; what the IdP "granted". */
  scope?: readonly string[]
  /** Value for the tenant claim, when the issuer is in token-decides mode. */
  tenant?: string | null
  /** Name of the tenant claim. Default `tenant`. */
  tenantClaim?: string
  /** `test` marks the token for the sandbox only; `live` mimics a real IdP. */
  mode: 'test' | 'live'
  /** Seconds until expiry. Default one hour. */
  expiresInS?: number
  /** Anything else the caller wants on the token (never overrides the above). */
  extraClaims?: Record<string, unknown>
}

export interface MintedToken {
  token: string
  expiresIn: number
  scope: string
}

export async function mintMockToken(keys: MockIssuerKeys, input: MintInput): Promise<MintedToken> {
  const { SignJWT } = await import('jose')
  const expiresIn = Math.max(1, Math.floor(input.expiresInS ?? 3600))
  const scope = (input.scope ?? []).join(' ')
  const claims: Record<string, unknown> = {
    ...(input.extraClaims ?? {}),
    azp: input.subject,
    scope,
  }
  if (input.tenant) claims[input.tenantClaim || 'tenant'] = input.tenant
  if (input.mode === 'test') claims[MOCK_MODE_CLAIM] = 'test'
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: keys.alg, kid: keys.kid })
    .setIssuer(input.issuer)
    .setAudience(input.audience)
    .setSubject(input.subject)
    .setIssuedAt()
    .setExpirationTime(`${expiresIn}s`)
    .setJti(cryptoRandomId())
    .sign(keys.privateKey)
  return { token, expiresIn, scope }
}

function cryptoRandomId(): string {
  // `globalThis.crypto` is the Web Crypto API Node exposes; `node:crypto`
  // would work too but this keeps the file free of Node-only imports.
  return globalThis.crypto.randomUUID()
}
