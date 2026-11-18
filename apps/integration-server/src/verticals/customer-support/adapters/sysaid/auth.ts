/**
 * SysAid authentication — client-credentials OAuth2 flow.
 *
 * The caller supplies clientId + clientSecret + accountId (subdomain).
 * We exchange these for a short-lived Bearer token and store it in
 * credentials.accessToken; credentials.extra.accountId carries the subdomain
 * so the client can build the per-tenant base URL.
 *
 * Docs: https://developers.sysaid.com/docs/authentication-guide
 */
import axios from 'axios'
import type { Credentials, CredentialField } from '@opensteward/shared'
import { TOKEN_URL_TEMPLATE } from './constants'

export function getAuthUrlUnsupported(): never {
  throw new Error('sysaid uses client-credentials auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'accountId', label: 'Account ID (subdomain)', type: 'text', required: true },
    { name: 'clientId', label: 'Client ID', type: 'text', required: true },
    { name: 'clientSecret', label: 'Client Secret', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const accountId = fields['accountId']
  const clientId = fields['clientId']
  const clientSecret = fields['clientSecret']

  if (!accountId) throw new Error('sysaid credentialFields require accountId')
  if (!clientId) throw new Error('sysaid credentialFields require clientId')
  if (!clientSecret) throw new Error('sysaid credentialFields require clientSecret')

  const tokenUrl = TOKEN_URL_TEMPLATE.replace('{account}', accountId)

  const { data } = await axios.post<{ accessToken?: string; token?: string }>(
    tokenUrl,
    { clientId, clientSecret },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-sysaid-accountid': accountId,
      },
      timeout: 15_000,
    },
  )

  const accessToken = data.accessToken ?? data.token
  if (!accessToken) throw new Error('sysaid token exchange returned no access token')

  return {
    accessToken,
    extra: { accountId, clientId, clientSecret },
  }
}

/** Re-exchange credentials using stored clientId/clientSecret to refresh the token. */
export async function refreshSysaidCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = (credentials.extra ?? {}) as Record<string, string>
  const { accountId, clientId, clientSecret } = extra
  if (!accountId || !clientId || !clientSecret) return credentials
  return exchangeCredentials({ accountId, clientId, clientSecret })
}
