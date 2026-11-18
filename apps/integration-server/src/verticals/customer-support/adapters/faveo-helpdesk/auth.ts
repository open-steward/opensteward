/**
 * Faveo Helpdesk authentication (v3).
 *
 * Auth model: static credentials — the user provides their Faveo instance URL,
 * user_name (or email) and password, and (optionally) the API key configured
 * in Admin > Settings > API.
 * We POST to v3/api/login and store the returned JWT (data.data.token) as accessToken.
 * The tenant's base URL is stored in credentials.extra.baseUrl.
 *
 * v3 response envelope: { success, message, data: { token, user } }
 *
 * No OAuth2 / authorization-code flow is supported.
 */
import axios from 'axios'
import type { Credentials, CredentialField } from '@opensteward/shared'
import { AUTH_PATH, DEMO_BASE_URL } from './constants'

/** v3 login envelope: { success, message, data: { token, user } } */
interface AuthEnvelope {
  success?: boolean
  message?: string
  data?: {
    token?: string
    user?: Record<string, unknown>
  }
}

export function getAuthUrlUnsupported(): never {
  throw new Error('faveo-helpdesk uses username/password auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'baseUrl',
      label: 'Faveo Helpdesk URL',
      type: 'text',
      required: true,
      helpText: 'The base URL of your Faveo installation (e.g. https://helpdesk.acme.com).',
    },
    {
      name: 'user_name',
      label: 'Username or Email',
      type: 'text',
      required: true,
      helpText: 'Your Faveo username or email address.',
    },
    {
      name: 'password',
      label: 'Password',
      type: 'password',
      required: true,
    },
    {
      name: 'apiKey',
      label: 'API Key (optional)',
      type: 'password',
      required: false,
      helpText:
        'Alphanumeric API key from Admin > Settings > API. Only required if the admin has made it mandatory.',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const baseUrl = (fields['baseUrl'] ?? DEMO_BASE_URL).replace(/\/$/, '')
  // Accept both 'user_name' (canonical v3 field) and legacy 'username' key for compatibility
  const user_name = fields['user_name'] ?? fields['username']
  const password = fields['password']
  const apiKey = fields['apiKey']

  if (!user_name) throw new Error('faveo-helpdesk: user_name is required')
  if (!password) throw new Error('faveo-helpdesk: password is required')

  // v3 login accepts user_name OR email; we send user_name (caller may pass an email address there)
  const body: Record<string, string> = { user_name, password }
  if (apiKey) body['api_key'] = apiKey

  const { data } = await axios.post<AuthEnvelope>(`${baseUrl}/${AUTH_PATH}`, body, {
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  })

  // v3 wraps the token inside data.data.token
  const token = data?.data?.token
  if (!token) {
    throw new Error(
      `faveo-helpdesk: authentication failed — ${data?.message ?? 'no token returned'}`,
    )
  }

  return {
    accessToken: token,
    extra: {
      baseUrl,
      ...(apiKey ? { apiKey } : {}),
    },
  }
}
