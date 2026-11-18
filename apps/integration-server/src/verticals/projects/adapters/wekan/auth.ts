/**
 * Wekan authentication — API key (token) model.
 *
 * Wekan is self-hosted. The caller supplies:
 *   - serverUrl  — e.g. https://boards.example.com
 *   - username   — Wekan username or email
 *   - password   — Wekan password
 *
 * On exchangeCredentials we call POST /users/login to obtain a Bearer token
 * and store it as accessToken. The serverUrl and userId are kept in `extra`
 * so the client can build absolute URLs and scope board queries.
 *
 * Alternatively, callers who already have a token (e.g. from a service
 * account env-var) can skip the exchange and supply the token directly via
 * the `token` field.
 */
import axios from 'axios'
import type { Credentials, CredentialField } from '@opensteward/shared'
import { LOGIN_PATH } from './constants'

export function getAuthUrlUnsupported(): never {
  throw new Error('wekan uses username/password or static API token; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'serverUrl',
      label: 'Server URL',
      type: 'text',
      required: true,
      helpText: 'Base URL of your Wekan installation, e.g. https://boards.example.com',
    },
    {
      name: 'username',
      label: 'Username',
      type: 'text',
      required: false,
      helpText: 'Wekan username (required if token is not provided)',
    },
    {
      name: 'password',
      label: 'Password',
      type: 'password',
      required: false,
      helpText: 'Wekan password (required if token is not provided)',
    },
    {
      name: 'token',
      label: 'API Token',
      type: 'password',
      required: false,
      helpText: 'Pre-existing Bearer token; if supplied, username + password are ignored',
    },
    {
      name: 'userId',
      label: 'User ID',
      type: 'text',
      required: false,
      helpText: 'Wekan user _id; required with a static token to scope board queries',
    },
  ]
}

interface LoginResponse {
  id: string
  token: string
  tokenExpires?: string
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const serverUrl = (fields['serverUrl'] ?? '').replace(/\/$/, '')
  if (!serverUrl) throw new Error('wekan: serverUrl is required')

  // If a static token is supplied, skip the login call.
  if (fields['token']) {
    return {
      accessToken: fields['token'],
      extra: {
        serverUrl,
        userId: fields['userId'] ?? '',
      },
    }
  }

  const username = fields['username']
  const password = fields['password']
  if (!username || !password) {
    throw new Error('wekan: provide either a static token or username + password')
  }

  const { data } = await axios.post<LoginResponse>(
    `${serverUrl}${LOGIN_PATH}`,
    { username, password },
    { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } },
  )

  return {
    accessToken: data.token,
    expiresAt: data.tokenExpires ? new Date(data.tokenExpires) : undefined,
    extra: {
      serverUrl,
      userId: data.id,
    },
  }
}
