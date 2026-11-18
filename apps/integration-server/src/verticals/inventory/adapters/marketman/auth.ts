/**
 * MarketMan auth helpers.
 *
 * MarketMan uses an API-key + API-password pair to obtain a short-lived
 * session token via POST /buyers/auth/GetToken.  The token is then sent
 * as the AUTH_TOKEN request header on every subsequent call.
 *
 * We store { accessToken: <token>, extra: { apiKey, apiPassword, buyerGuid } }
 * so that refreshCredentials() can re-acquire a token when it expires.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'
import axios from 'axios'
import { API_BASE_URL, TOKEN_PATH } from './constants'

export function getAuthUrlUnsupported(): never {
  throw new Error('marketman uses API key + password; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'apiKey', label: 'API Key', type: 'password', required: true },
    { name: 'apiPassword', label: 'API Password', type: 'password', required: true },
    { name: 'buyerGuid', label: 'Buyer GUID (optional)', type: 'text', required: false },
  ]
}

interface GetTokenResponse {
  Token?: string
  token?: string
}

export async function acquireToken(apiKey: string, apiPassword: string): Promise<string> {
  const { data } = await axios.post<GetTokenResponse>(
    `${API_BASE_URL}${TOKEN_PATH}`,
    { APIKey: apiKey, APIPassword: apiPassword },
    { headers: { 'Content-Type': 'application/json' }, timeout: 15_000 },
  )
  const token = data.Token ?? data.token ?? ''
  if (!token) throw new Error('marketman GetToken returned no token')
  return token
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey'] ?? ''
  const apiPassword = fields['apiPassword'] ?? ''
  const buyerGuid = fields['buyerGuid'] ?? ''
  if (!apiKey || !apiPassword) throw new Error('marketman requires apiKey and apiPassword')
  const token = await acquireToken(apiKey, apiPassword)
  return {
    accessToken: token,
    extra: { apiKey, apiPassword, buyerGuid },
  }
}
