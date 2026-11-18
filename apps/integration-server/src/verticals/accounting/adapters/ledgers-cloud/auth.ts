/**
 * LEDGERS.Cloud authentication.
 *
 * LEDGERS.Cloud uses a dual-credential scheme:
 *   1. A static API key supplied in x-api-key header (tied to the business account).
 *   2. A session token obtained via POST /v3/login (email + password), valid 24 hours.
 *
 * The Connect Link form collects `apiKey`, `email`, and `password`.
 * `exchangeCredentials` calls /v3/login and stores both the API key (in
 * `credentials.extra.apiKey`) and the session token (in `credentials.accessToken`).
 *
 * `refreshCredentials` re-runs the login to obtain a fresh session token.
 *
 * Docs: https://ledgers.readme.io/reference/authentication-1
 */

import axios from 'axios'
import { customForm } from '@opensteward/shared'
import type { Credentials } from '../../adapter/interface'
import { LEDGERS_LOGIN_URL } from './constants'

interface LedgersLoginResponse {
  api_token?: string
  token?: string
  access_token?: string
  data?: { token?: string; access_token?: string }
  [key: string]: unknown
}

function extractToken(data: LedgersLoginResponse): string {
  // Documented 200 response (https://ledgers.readme.io/reference/authentication-1):
  //   { "status": 200, "api_token": "…" }
  // The remaining shapes are legacy fallbacks.
  const token =
    data.api_token ??
    data.token ??
    data.access_token ??
    (data.data as LedgersLoginResponse | undefined)?.token ??
    (data.data as LedgersLoginResponse | undefined)?.access_token
  if (!token) throw new Error('LEDGERS.Cloud login did not return a token')
  return token as string
}

export async function loginWithPassword(
  apiKey: string,
  email: string,
  password: string,
): Promise<Credentials> {
  const { data } = await axios.post<LedgersLoginResponse>(
    LEDGERS_LOGIN_URL,
    { email, password },
    {
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    },
  )
  const token = extractToken(data)
  return {
    accessToken: token,
    // Token lasts 24 hours
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    extra: { apiKey, email, password },
  }
}

export const LEDGERS_AUTH_FORM = customForm({
  fields: [
    {
      name: 'apiKey',
      label: 'Developer API Key',
      type: 'password',
      required: true,
      helpText:
        'Found in your LEDGERS account under Settings → Developer Keys (Administrator role required).',
    },
    {
      name: 'email',
      label: 'Login Email',
      type: 'email',
      required: true,
      helpText: 'The email address associated with your LEDGERS.Cloud business account.',
    },
    {
      name: 'password',
      label: 'Login Password',
      type: 'password',
      required: true,
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const apiKey = (fields['apiKey'] ?? '').trim()
    const email = (fields['email'] ?? '').trim()
    const password = fields['password'] ?? ''
    if (!apiKey) throw new Error('Developer API Key is required.')
    if (!email) throw new Error('Login Email is required.')
    if (!password) throw new Error('Login Password is required.')
    return loginWithPassword(apiKey, email, password)
  },
})
