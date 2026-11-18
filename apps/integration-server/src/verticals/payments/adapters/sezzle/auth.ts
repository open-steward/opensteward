/**
 * Sezzle auth is a two-key exchange, not a static bearer key.
 *
 * The merchant supplies a **public key** + **private key** (minted in the
 * Sezzle dashboard for a specific environment). We POST both to
 * `/v2/authentication`; Sezzle returns a short-lived bearer `token`
 * (≈120 min) plus its `expiration_date`. Every subsequent call carries
 * `Authorization: Bearer {token}`.
 *
 * We persist the originating keys + environment on `credentials.extra` so
 * `refreshCredentials` can re-mint a token without re-prompting the merchant,
 * and so webhook verification can reach the private key (Sezzle signs
 * webhooks with HMAC-SHA256 keyed on the private key).
 *
 * Docs:
 *   https://docs.sezzle.com/docs/api/core/authentication/postauthentication
 */
import type { Credentials } from '@opensteward/shared'
import type { CredentialField } from '@opensteward/shared'
import { AUTHENTICATION_PATH, baseUrlFor, type SezzleEnvironment } from './constants'

export interface SezzleCredentialExtra {
  publicKey: string
  privateKey: string
  environment: SezzleEnvironment
}

interface SezzleAuthResponse {
  token?: string
  expiration_date?: string
  merchant_uuid?: string
}

export const SEZZLE_CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'publicKey',
    label: 'Public key',
    type: 'text',
    required: true,
    placeholder: 'sz_pub_...',
    helpText:
      'From your Sezzle dashboard → Settings → API Keys, in the same environment you select below.',
  },
  {
    name: 'privateKey',
    label: 'Private key',
    type: 'password',
    required: true,
    placeholder: 'sz_pr_...',
    helpText:
      'The matching private key. Also used to verify incoming Sezzle webhook signatures.',
  },
  {
    name: 'environment',
    label: 'Environment',
    type: 'select',
    required: true,
    helpText: 'Sandbox keys only work against the sandbox gateway, and vice versa.',
    options: [
      { value: 'production', label: 'Production' },
      { value: 'sandbox', label: 'Sandbox' },
    ],
  },
]

function normaliseEnvironment(value: string | undefined): SezzleEnvironment {
  return value === 'sandbox' ? 'sandbox' : 'production'
}

/**
 * Exchange the public/private key pair for a bearer token. Stamps the keys +
 * environment onto `extra` for refresh and webhook verification.
 */
export async function exchangeSezzleCredentials(
  fields: Record<string, string>,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<Credentials> {
  const publicKey = (fields.publicKey ?? '').trim()
  const privateKey = (fields.privateKey ?? '').trim()
  const environment = normaliseEnvironment(fields.environment)
  if (!publicKey || !privateKey) {
    throw new Error('Sezzle requires both a public key and a private key.')
  }

  const res = await fetchImpl(`${baseUrlFor(environment)}${AUTHENTICATION_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ public_key: publicKey, private_key: privateKey }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Sezzle authentication failed (${res.status}): ${text}`)
  }
  const json = (await res.json()) as SezzleAuthResponse
  if (!json.token) throw new Error('Sezzle authentication returned no token.')

  const extra: SezzleCredentialExtra = { publicKey, privateKey, environment }
  return {
    accessToken: json.token,
    expiresAt: json.expiration_date ? new Date(json.expiration_date) : undefined,
    extra: extra as unknown as Record<string, unknown>,
  }
}

/**
 * Re-mint a bearer token from the stored key pair. Returns the existing
 * credentials unchanged when the keys are missing (nothing to refresh from).
 */
export async function refreshSezzleCredentials(
  credentials: Credentials,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<Credentials> {
  const extra = credentials.extra as Partial<SezzleCredentialExtra> | undefined
  if (!extra?.publicKey || !extra?.privateKey) return credentials
  return exchangeSezzleCredentials(
    {
      publicKey: extra.publicKey,
      privateKey: extra.privateKey,
      environment: extra.environment ?? 'production',
    },
    fetchImpl,
  )
}
