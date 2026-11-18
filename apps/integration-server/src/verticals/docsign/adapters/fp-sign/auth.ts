/**
 * FP Sign auth helpers.
 *
 * FP Sign authenticates with a Bearer token issued by `POST /login`
 * (username + password) and requires a `Tenant` header on every request. The
 * tenant id is read from the login response's first account
 * (`user.accounts[0].tenant.id`).
 *
 * There is no interactive OAuth flow, so the adapter's `getAuthUrl()` throws
 * and credentials are collected via the Connect Link `credentialFields()`
 * form. The bearer token is stored as `credentials.accessToken`; the tenant
 * id is stored on `credentials.extra.tenant`.
 */
import axios from 'axios'
import type { Credentials, CredentialField } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

export const FP_SIGN_CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'username',
    label: 'FP Sign username',
    type: 'text',
    helpText: 'The email address of the FP Sign account used for API access.',
    required: true,
  },
  {
    name: 'password',
    label: 'FP Sign password',
    type: 'password',
    helpText: 'The password for the FP Sign API account. Treat as a secret.',
    required: true,
  },
]

interface FpSignLoginResponse {
  value?: string
  token?: string
  user?: {
    id?: number | string
    accounts?: Array<{
      id?: number | string
      tenant?: { id?: number | string }
    }>
  }
}

/**
 * Exchange username + password for a Bearer token + tenant id via
 * `POST /login`.
 */
export async function exchangeFpSignCredentials(
  fields: Record<string, string>,
): Promise<Credentials> {
  const username = (fields.username ?? '').trim()
  const password = fields.password ?? ''
  if (!username || !password) {
    throw new Error('FP Sign username and password are required.')
  }

  const { data } = await axios.post<FpSignLoginResponse>(
    `${API_BASE_URL}/login`,
    { username, password },
    {
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      timeout: 30_000,
    },
  )

  const token = data.value ?? data.token
  if (!token) throw new Error('FP Sign login did not return a bearer token.')

  const account = data.user?.accounts?.[0]
  const tenant = account?.tenant?.id
  if (tenant === undefined || tenant === null || tenant === '') {
    throw new Error('FP Sign login did not return a tenant id.')
  }

  return {
    accessToken: token,
    extra: {
      tenant: String(tenant),
      userId: data.user?.id != null ? String(data.user.id) : undefined,
    },
  }
}

/**
 * FP Sign offers `GET /auth/refresh`, but the bearer token is long-lived for
 * server-to-server use and the credential store re-runs `exchangeCredentials`
 * when it expires, so the stored credentials are returned unchanged.
 */
export async function refreshFpSignCredentials(
  credentials: Credentials,
): Promise<Credentials> {
  return credentials
}
