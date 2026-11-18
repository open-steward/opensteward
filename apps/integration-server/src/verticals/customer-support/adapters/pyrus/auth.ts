/**
 * Pyrus API key auth.
 *
 * Pyrus uses a two-step auth:
 *   1. User provides their login email + security_key (from profile settings).
 *   2. We POST to /auth to exchange for an access_token.
 *   3. All subsequent calls use `Authorization: Bearer <access_token>`.
 *
 * Tokens have a limited lifetime; re-auth is required by calling /auth again
 * with the same credentials.
 */
import axios from 'axios'
import type { Credentials, CredentialField } from '@opensteward/shared'
import { AUTH_URL } from './constants'

export function getAuthUrlUnsupported(): never {
  throw new Error('pyrus uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'login',
      label: 'Login email',
      type: 'text',
      required: true,
      helpText: 'The email address associated with your Pyrus account (bot user).',
    },
    {
      name: 'securityKey',
      label: 'Security key',
      type: 'password',
      required: true,
      helpText: 'Found in your Pyrus profile under Profile → Authorization.',
    },
  ]
}

interface PyrusAuthResponse {
  access_token: string
  api_url?: string
  files_url?: string
  error?: string
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const login = fields['login']
  const securityKey = fields['securityKey']
  if (!login) throw new Error('pyrus credentialFields require login')
  if (!securityKey) throw new Error('pyrus credentialFields require securityKey')

  const { data } = await axios.post<PyrusAuthResponse>(
    AUTH_URL,
    { login, security_key: securityKey },
    { headers: { 'Content-Type': 'application/json' } },
  )

  if (data.error || !data.access_token) {
    throw new Error(`pyrus auth failed: ${data.error ?? 'no access_token returned'}`)
  }

  return {
    accessToken: data.access_token,
    extra: { login, securityKey },
  }
}

/**
 * Pyrus tokens expire; re-auth using stored credentials.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const login = credentials.extra?.['login'] as string | undefined
  const securityKey = credentials.extra?.['securityKey'] as string | undefined
  if (!login || !securityKey) return credentials
  return exchangeCredentials({ login, securityKey })
}
