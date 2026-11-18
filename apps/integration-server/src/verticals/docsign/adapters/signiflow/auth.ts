/**
 * SigniFlow auth helpers — username/password login flow.
 *
 * SigniFlow authenticates via POST /Login (UserNameField + PasswordField).
 * The response contains a TokenField object with TokenField (the token string)
 * and TokenExpiryField. This token is embedded in the JSON body of every
 * subsequent request — there is no Authorization header.
 *
 * The host is stored on `credentials.extra.host` so the client can target the
 * right deployment; it defaults to the public-cloud host when omitted.
 * The token string is stored as `credentials.accessToken`; the expiry is
 * stored in `credentials.extra.tokenExpiry` for refresh decisions.
 *
 * Docs: https://developers.signiflow.com/
 */
import type { Credentials, CredentialField } from '@opensteward/shared'
import { DEFAULT_HOST, API_SERVICE_PATH } from './constants'

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'username',
      label: 'SigniFlow username (email)',
      type: 'email',
      placeholder: 'you@example.com',
      helpText:
        'The email address you use to sign in to SigniFlow. The adapter calls POST /Login to obtain a session token.',
      required: true,
    },
    {
      name: 'password',
      label: 'SigniFlow password',
      type: 'password',
      placeholder: '',
      helpText: 'Your SigniFlow account password.',
      required: true,
    },
    {
      name: 'host',
      label: 'SigniFlow host',
      type: 'url',
      placeholder: DEFAULT_HOST,
      helpText:
        'Base URL of your SigniFlow deployment, e.g. https://web1.signiflow.com (public cloud) or your private install host. Leave blank to use the public cloud.',
      required: false,
    },
  ]
}

interface LoginResponse {
  ResultField?: string
  TokenField?: {
    TokenField?: string
    TokenExpiryField?: string
  }
}

export async function exchangeCredentials(
  fields: Record<string, string>,
): Promise<Credentials> {
  const username = (fields.username ?? '').trim()
  const password = fields.password ?? ''
  if (!username) throw new Error('SigniFlow username is required.')
  if (!password) throw new Error('SigniFlow password is required.')
  const host = (fields.host ?? '').trim().replace(/\/+$/, '') || DEFAULT_HOST
  const baseUrl = `${host}${API_SERVICE_PATH}`

  const res = await fetch(`${baseUrl}/Login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ UserNameField: username, PasswordField: password }),
  })
  if (!res.ok) {
    throw new Error(`SigniFlow /Login failed: HTTP ${res.status}`)
  }
  const data = (await res.json()) as LoginResponse
  const token = data.TokenField?.TokenField ?? ''
  if (!token) throw new Error('SigniFlow /Login returned no token.')

  return {
    accessToken: token,
    extra: {
      host,
      username,
      password,
      tokenExpiry: data.TokenField?.TokenExpiryField ?? '',
    },
  }
}

/**
 * Re-login to obtain a fresh token. Called when a request fails with an auth
 * error or when the stored token is known to have expired.
 */
export async function refreshLogin(credentials: Credentials): Promise<Credentials> {
  const username = String(credentials.extra?.['username'] ?? '')
  const password = String(credentials.extra?.['password'] ?? '')
  const host = String(credentials.extra?.['host'] ?? DEFAULT_HOST)
  return exchangeCredentials({ username, password, host })
}
