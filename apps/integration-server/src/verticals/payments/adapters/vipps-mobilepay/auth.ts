/**
 * Vipps MobilePay authentication.
 *
 * Vipps does NOT use OAuth2 redirect/code. Every API call carries a short-lived
 * Bearer access token obtained from the Access Token API by POSTing the
 * merchant's API keys (no body) to `/accesstoken/get`:
 *
 *   client_id, client_secret, Ocp-Apim-Subscription-Key  (in the headers)
 *
 * The response carries `access_token` (a JWT), `token_type: "Bearer"` and
 * `expires_on` (Unix seconds). The token is valid for 1h in test / 24h in
 * production and may be reused until it expires.
 *
 * Because the access token alone is not enough to call the ePayment API — the
 * subscription key and merchant serial number must accompany every request —
 * we store all four credential values plus the chosen environment on
 * `credentials.extra`, and put the fetched Bearer token on `accessToken`.
 * `refreshCredentials` re-runs the grant from `extra`.
 *
 * Auth type: api_key (collected via the Connect Link form, not OAuth).
 *
 * Docs: https://developer.vippsmobilepay.com/docs/APIs/access-token-api/
 */
import { customForm } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import {
  ACCESS_TOKEN_PATH,
  PROD_API_BASE_URL,
  TEST_API_BASE_URL,
} from './constants'

/** Credential values the merchant supplies, persisted on `credentials.extra`. */
export interface VippsCredentialExtra {
  clientId: string
  clientSecret: string
  subscriptionKey: string
  merchantSerialNumber: string
  environment: 'production' | 'test'
}

interface AccessTokenResponse {
  token_type?: string
  expires_in?: string | number
  expires_on?: string | number
  access_token: string
}

export function hostFor(environment: string | undefined): string {
  return environment === 'test' ? TEST_API_BASE_URL : PROD_API_BASE_URL
}

/**
 * Read the four Vipps credential values back off `credentials.extra`. Throws
 * when the connection was not provisioned through the Connect Link form (i.e.
 * `extra` is missing the required keys).
 */
export function extraOf(credentials: Credentials): VippsCredentialExtra {
  const e = (credentials.extra ?? {}) as Partial<VippsCredentialExtra>
  if (!e.clientId || !e.clientSecret || !e.subscriptionKey || !e.merchantSerialNumber) {
    throw new Error(
      'Vipps MobilePay credentials are incomplete; reconnect via the Connect Link form.',
    )
  }
  return {
    clientId: e.clientId,
    clientSecret: e.clientSecret,
    subscriptionKey: e.subscriptionKey,
    merchantSerialNumber: e.merchantSerialNumber,
    environment: e.environment === 'test' ? 'test' : 'production',
  }
}

/**
 * Exchange the merchant API keys for a Bearer access token via the Access
 * Token API. Returns `{ access_token, expires_on }`.
 */
export async function fetchAccessToken(
  extra: VippsCredentialExtra,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<{ accessToken: string; expiresAt?: Date }> {
  const url = `${hostFor(extra.environment)}${ACCESS_TOKEN_PATH}`
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      client_id: extra.clientId,
      client_secret: extra.clientSecret,
      'Ocp-Apim-Subscription-Key': extra.subscriptionKey,
      'Merchant-Serial-Number': extra.merchantSerialNumber,
      accept: 'application/json',
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Vipps access token request returned ${res.status}: ${text}`)
  }
  const json = (await res.json()) as AccessTokenResponse
  const expiresOn = json.expires_on != null ? Number(json.expires_on) : undefined
  return {
    accessToken: json.access_token,
    expiresAt:
      expiresOn != null && !Number.isNaN(expiresOn) ? new Date(expiresOn * 1000) : undefined,
  }
}

/** Build `Credentials` from supplied form fields by running the token grant. */
export async function buildCredentials(
  fields: Record<string, string>,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<Credentials> {
  const extra: VippsCredentialExtra = {
    clientId: (fields.clientId ?? '').trim(),
    clientSecret: (fields.clientSecret ?? '').trim(),
    subscriptionKey: (fields.subscriptionKey ?? '').trim(),
    merchantSerialNumber: (fields.merchantSerialNumber ?? '').trim(),
    environment: fields.environment === 'test' ? 'test' : 'production',
  }
  if (!extra.clientId || !extra.clientSecret || !extra.subscriptionKey || !extra.merchantSerialNumber) {
    throw new Error(
      'Client ID, client secret, subscription key and merchant serial number are all required.',
    )
  }
  const token = await fetchAccessToken(extra, fetchImpl)
  return {
    accessToken: token.accessToken,
    expiresAt: token.expiresAt,
    extra: { ...extra },
  }
}

/** Connect Link form descriptor + exchange for the api_key flow. */
export const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'clientId',
      label: 'Client ID',
      type: 'text',
      required: true,
      helpText: 'Sales-unit client_id from the Vipps MobilePay merchant portal.',
    },
    {
      name: 'clientSecret',
      label: 'Client secret',
      type: 'password',
      required: true,
      helpText: 'Sales-unit client_secret from the merchant portal.',
    },
    {
      name: 'subscriptionKey',
      label: 'Subscription key',
      type: 'password',
      required: true,
      helpText:
        'Ocp-Apim-Subscription-Key (the "primary" subscription key) for the sales unit.',
    },
    {
      name: 'merchantSerialNumber',
      label: 'Merchant serial number (MSN)',
      type: 'text',
      required: true,
      placeholder: '123456',
      helpText: 'The sales unit merchant serial number, 4–10 digits.',
    },
    {
      name: 'environment',
      label: 'Environment',
      type: 'select',
      required: true,
      options: [
        { value: 'production', label: 'Production' },
        { value: 'test', label: 'Test (MT)' },
      ],
    },
  ],
  exchange: (fields) => buildCredentials(fields),
})
