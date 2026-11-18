/**
 * Gr4vy authentication.
 *
 * Gr4vy authenticates every request with a Bearer JSON Web Token signed by the
 * merchant's private API key. The key is an EC P-521 (secp521r1) private key in
 * PEM (PKCS#8) form, downloaded once from the dashboard Integrations panel and
 * never re-shown — so it is collected through the Connect Link form and stored
 * verbatim. There is no OAuth flow and the key never expires, so
 * `refreshCredentials` is a no-op; instead a short-lived JWT is minted per
 * request (see {@link buildBearerToken}).
 *
 * The JWT is ES512-signed. Its `kid` header is the RFC 7638 JWK thumbprint
 * (SHA-256, base64url) of the key — exactly how Gr4vy's own SDKs derive it —
 * so the merchant never has to copy the key id separately.
 *
 * Docs: https://docs.gr4vy.com/guides/api/authentication
 *       https://docs.gr4vy.com/guides/api/jwts
 */
import { createHash, createPrivateKey, randomUUID, sign as signRaw } from 'node:crypto'
import { customForm, type CredentialField, type Credentials } from '@opensteward/shared'
import { TOKEN_TTL_SECONDS } from './constants'

const ENVIRONMENT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'sandbox', label: 'Sandbox' },
  { value: 'production', label: 'Production' },
]

const FIELDS: CredentialField[] = [
  {
    name: 'gr4vyId',
    label: 'Gr4vy instance ID',
    type: 'text',
    required: true,
    placeholder: 'acme',
    helpText:
      'The unique instance identifier embedded in your API host (e.g. `acme` in api.acme.gr4vy.app).',
  },
  {
    name: 'privateKey',
    label: 'Private API key (PEM)',
    type: 'password',
    required: true,
    helpText:
      'The EC private key downloaded from the dashboard Integrations panel, in PEM format (-----BEGIN PRIVATE KEY-----…). Stored encrypted; used to sign request JWTs.',
  },
  {
    name: 'environment',
    label: 'Environment',
    type: 'select',
    required: true,
    options: ENVIRONMENT_OPTIONS,
    helpText: 'Sandbox uses api.sandbox.{id}.gr4vy.app; production uses api.{id}.gr4vy.app.',
  },
]

/** PEM private keys may arrive with literal `\n` escapes from a JSON form. */
function normalisePem(raw: string): string {
  return raw.includes('-----BEGIN') && raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw
}

export const CREDENTIAL_FORM = customForm({
  fields: FIELDS,
  async exchange(input: Record<string, string>): Promise<Credentials> {
    const gr4vyId = (input.gr4vyId ?? '').trim()
    const privateKey = normalisePem((input.privateKey ?? '').trim())
    const environment = (input.environment ?? 'production').trim() || 'production'
    if (!gr4vyId) throw new Error('Gr4vy instance ID is required.')
    if (!privateKey) throw new Error('Private API key (PEM) is required.')
    // Fail fast on a malformed key rather than at first API call.
    try {
      createPrivateKey(privateKey)
    } catch {
      throw new Error('Private API key is not a valid PEM-encoded private key.')
    }
    return {
      // No long-lived access token; the private key signs per-request JWTs.
      accessToken: '',
      extra: { gr4vyId, privateKey, environment },
    }
  },
})

export function credentialFields(): CredentialField[] {
  return CREDENTIAL_FORM.credentialFields()
}

export function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  return CREDENTIAL_FORM.exchangeCredentials(fields)
}

export interface Gr4vyAuthConfig {
  gr4vyId: string
  privateKey: string
  environment: string
}

/** Pull the instance config off stored credentials, validating its presence. */
export function readAuthConfig(credentials: Credentials): Gr4vyAuthConfig {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const gr4vyId = typeof extra.gr4vyId === 'string' ? extra.gr4vyId : ''
  const privateKey = typeof extra.privateKey === 'string' ? extra.privateKey : ''
  const environment = typeof extra.environment === 'string' ? extra.environment : 'production'
  if (!gr4vyId || !privateKey) {
    throw new Error('Gr4vy credentials are missing the instance ID or private key.')
  }
  return { gr4vyId, privateKey, environment }
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

/**
 * Derive the JWT `kid` — the RFC 7638 JWK thumbprint of the EC key. The
 * thumbprint hashes the canonical (lexically-ordered, whitespace-free) JWK
 * `{crv, kty, x, y}` with SHA-256 and base64url-encodes it.
 */
function keyId(privateKeyPem: string): string {
  const jwk = createPrivateKey(privateKeyPem).export({ format: 'jwk' }) as {
    crv?: string
    kty?: string
    x?: string
    y?: string
  }
  const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })
  return createHash('sha256').update(canonical).digest('base64url')
}

/**
 * Mint a short-lived ES512 Bearer JWT for the API. ES512 is ECDSA over P-521
 * with SHA-512 and an IEEE-P1363 (`r||s`) signature — the JWS encoding.
 */
export function buildBearerToken(
  config: Gr4vyAuthConfig,
  scopes: readonly string[],
  ttlSeconds: number = TOKEN_TTL_SECONDS,
): string {
  const keyObject = createPrivateKey(config.privateKey)
  const now = Math.floor(Date.now() / 1000)
  const header = { typ: 'JWT', alg: 'ES512', kid: keyId(config.privateKey) }
  const payload = {
    iss: 'OpenSteward',
    nbf: now,
    exp: now + ttlSeconds,
    jti: randomUUID(),
    scopes: [...scopes],
  }
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`
  const signature = signRaw('sha512', Buffer.from(signingInput), {
    key: keyObject,
    dsaEncoding: 'ieee-p1363',
  })
  return `${signingInput}.${base64url(signature)}`
}
