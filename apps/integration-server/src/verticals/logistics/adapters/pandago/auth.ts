/**
 * pandago auth — OAuth 2.0 client_credentials with JWT bearer assertion.
 *
 * pandago does NOT accept a plain client_secret. Instead, the caller must:
 *   1. Hold an RSA-2048 private key (PEM).
 *   2. Sign a short-lived JWT (RS256) containing iss/sub/jti/aud/exp.
 *   3. POST to the STS token endpoint with:
 *        grant_type=client_credentials
 *        client_id=<clientId>
 *        client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer
 *        client_assertion=<signed-jwt>
 *        scope=<scope>   (e.g. "pandago.api.sg.*")
 *
 * Credentials stored on `credentials.extra`:
 *   clientId    — obtained from pandago account manager
 *   keyId       — RSA key identifier (kid)
 *   privateKey  — PEM-encoded RSA-2048 private key
 *   scope       — e.g. "pandago.api.sg.*"
 *   countryCode — ISO 3166-1 alpha-2, e.g. "sg" (default)
 *   sandbox     — "true" | "false"
 *
 * References:
 *   https://on-demand-rider-docs.deliveryhero.io/
 *   https://support.aftership.com/en/shipping/article/get-credentials-to-access-pandago-shipping-api-15gvyco
 */

import { createSign, randomUUID } from 'node:crypto'
import type { CredentialField, Credentials } from '@opensteward/shared'
import {
  PANDAGO_GRANT_TYPE,
  PANDAGO_CLIENT_ASSERTION_TYPE,
  PANDAGO_JWT_ALG,
  PANDAGO_JWT_TTL_MS,
  PANDAGO_STS_PROD,
  PANDAGO_STS_STAGE,
  DEFAULT_COUNTRY_CODE,
  PANDAGO_DOCS_URL,
} from './constants'

// ── Credential form fields ─────────────────────────────────────────────────

const CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'clientId',
    label: 'Client ID',
    type: 'text',
    required: true,
    helpText: 'Provided by your pandago account manager.',
  },
  {
    name: 'keyId',
    label: 'Key ID',
    type: 'text',
    required: true,
    helpText: 'Key identifier (kid) provided by your pandago account manager.',
  },
  {
    name: 'scope',
    label: 'Scope',
    type: 'text',
    placeholder: 'pandago.api.sg.*',
    required: true,
    helpText: `OAuth scope provided by pandago (e.g. pandago.api.sg.*). Docs: ${PANDAGO_DOCS_URL}`,
  },
  {
    name: 'privateKey',
    label: 'RSA Private Key (PEM)',
    type: 'password',
    required: true,
    helpText:
      'PEM-encoded RSA-2048 private key. Generate with: openssl genrsa -out private.pem 2048 — then share the matching public key with pandago.',
  },
  {
    name: 'countryCode',
    label: 'Country Code',
    type: 'select',
    required: false,
    helpText: 'Market / country your pandago account covers. Defaults to sg.',
    options: [
      { value: 'sg', label: 'Singapore (sg)' },
      { value: 'hk', label: 'Hong Kong (hk)' },
      { value: 'ph', label: 'Philippines (ph)' },
      { value: 'my', label: 'Malaysia (my)' },
      { value: 'th', label: 'Thailand (th)' },
      { value: 'tw', label: 'Taiwan (tw)' },
      { value: 'bd', label: 'Bangladesh (bd)' },
      { value: 'kh', label: 'Cambodia (kh)' },
      { value: 'la', label: 'Laos (la)' },
      { value: 'mm', label: 'Myanmar (mm)' },
      { value: 'pk', label: 'Pakistan (pk)' },
    ],
  },
  {
    name: 'sandbox',
    label: 'Sandbox mode',
    type: 'select',
    required: false,
    helpText: 'Use the pandago staging environment.',
    options: [
      { value: 'false', label: 'Production' },
      { value: 'true', label: 'Sandbox / staging' },
    ],
  },
]

export function credentialFields(): CredentialField[] {
  return CREDENTIAL_FIELDS
}

// ── JWT builder ────────────────────────────────────────────────────────────

/**
 * Build and sign a short-lived RS256 JWT suitable for use as
 * `client_assertion` in the pandago token request.
 */
function buildClientAssertion(opts: {
  clientId: string
  keyId: string
  privateKeyPem: string
  audience: string
}): string {
  const now = Math.floor(Date.now() / 1000)
  const exp = Math.floor((Date.now() + PANDAGO_JWT_TTL_MS) / 1000)

  const header = Buffer.from(
    JSON.stringify({ alg: PANDAGO_JWT_ALG, typ: 'JWT', kid: opts.keyId }),
  ).toString('base64url')

  const payload = Buffer.from(
    JSON.stringify({
      iss: opts.clientId,
      sub: opts.clientId,
      jti: randomUUID(),
      aud: opts.audience,
      iat: now,
      exp,
    }),
  ).toString('base64url')

  const signingInput = `${header}.${payload}`
  const sign = createSign('RSA-SHA256')
  sign.update(signingInput)
  sign.end()
  const signature = sign.sign(opts.privateKeyPem, 'base64url')

  return `${signingInput}.${signature}`
}

// ── Token request ──────────────────────────────────────────────────────────

interface TokenResponse {
  access_token: string
  expires_in?: number
  token_type?: string
  scope?: string
}

async function fetchToken(opts: {
  clientId: string
  keyId: string
  privateKeyPem: string
  scope: string
  isSandbox: boolean
  fetchImpl?: typeof fetch
}): Promise<{ accessToken: string; expiresAt?: Date; scope?: string }> {
  const fetchFn = opts.fetchImpl ?? globalThis.fetch
  const stsUrl = opts.isSandbox ? PANDAGO_STS_STAGE : PANDAGO_STS_PROD
  const audience = opts.isSandbox
    ? 'https://sts-st.deliveryhero.io'
    : 'https://sts.deliveryhero.io'

  const clientAssertion = buildClientAssertion({
    clientId: opts.clientId,
    keyId: opts.keyId,
    privateKeyPem: opts.privateKeyPem,
    audience,
  })

  const body = new URLSearchParams({
    grant_type: PANDAGO_GRANT_TYPE,
    client_id: opts.clientId,
    client_assertion_type: PANDAGO_CLIENT_ASSERTION_TYPE,
    client_assertion: clientAssertion,
    scope: opts.scope,
  })

  const res = await fetchFn(stsUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`pandago token endpoint ${stsUrl} returned ${res.status}: ${text}`)
  }

  const json = (await res.json()) as TokenResponse
  const expiresAt =
    typeof json.expires_in === 'number'
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined

  return { accessToken: json.access_token, expiresAt, scope: json.scope }
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const clientId = (fields['clientId'] ?? '').trim()
  const keyId = (fields['keyId'] ?? '').trim()
  const scope = (fields['scope'] ?? '').trim()
  const privateKey = (fields['privateKey'] ?? '').trim()
  const countryCode = (fields['countryCode'] ?? DEFAULT_COUNTRY_CODE).trim()
  const isSandbox = (fields['sandbox'] ?? 'false') === 'true'

  if (!clientId || !keyId || !scope || !privateKey) {
    throw new Error('pandago: clientId, keyId, scope, and privateKey are all required.')
  }

  const { accessToken, expiresAt, scope: returnedScope } = await fetchToken({
    clientId,
    keyId,
    privateKeyPem: privateKey,
    scope,
    isSandbox,
  })

  return {
    accessToken,
    expiresAt,
    scope: returnedScope ?? scope,
    extra: {
      clientId,
      keyId,
      privateKey,
      scope,
      countryCode,
      sandbox: String(isSandbox),
    },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = credentials.extra ?? {}
  const clientId = String(extra['clientId'] ?? '')
  const keyId = String(extra['keyId'] ?? '')
  const privateKey = String(extra['privateKey'] ?? '')
  const scope = String(extra['scope'] ?? '')
  const countryCode = String(extra['countryCode'] ?? DEFAULT_COUNTRY_CODE)
  const isSandbox = String(extra['sandbox'] ?? 'false') === 'true'

  if (!clientId || !keyId || !privateKey || !scope) {
    // Cannot refresh without stored credentials — return as-is and let the
    // next API call surface the 401.
    return credentials
  }

  const { accessToken, expiresAt, scope: returnedScope } = await fetchToken({
    clientId,
    keyId,
    privateKeyPem: privateKey,
    scope,
    isSandbox,
  })

  return {
    accessToken,
    expiresAt,
    scope: returnedScope ?? scope,
    extra: { clientId, keyId, privateKey, scope, countryCode, sandbox: String(isSandbox) },
  }
}

/**
 * getAuthUrl is not applicable for pandago (uses client_credentials, not
 * authorization_code flow). Throws to prevent silent misuse.
 */
export function getAuthUrl(_state: string): never {
  throw new Error(
    'pandago uses OAuth2 client_credentials + JWT assertion; use credentialFields() / exchangeCredentials() instead.',
  )
}
