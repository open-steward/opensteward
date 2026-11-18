/**
 * 3PL Central (Extensiv Warehouse Manager) token request.
 *
 * Per the vendor's Postman collection
 * (https://developer.3plcentral.com/api/collections/8399762/SVn3tFsv?segregateAuth=true&versionTag=latest),
 * "POST_Auth_Token":
 *   POST https://secure-wms.com/AuthServer/api/Token
 *   Authorization: Basic base64(ClientID:ClientSecret)
 *   Content-Type: application/json; charset=utf-8
 *   Body: { "grant_type": "client_credentials", "tpl": "<TPL GUID>" (optional),
 *           "user_login_id": "<3PL UserLogin ID>" }
 *
 * The client credentials are issued per warehouse, so the platform connects
 * through credentialFields() rather than a browser redirect. There is no
 * refresh_token: the adapter re-requests a token from the stored credentials.
 *
 * customerId / facilityId are not auth parameters; the read methods in index.ts
 * put them in the request path or query, so the form collects them here.
 */
import axios from 'axios'
import type { Credentials, CredentialField } from '@opensteward/shared'
import { TOKEN_URL } from './constants'

export function getAuthUrlUnsupported(): never {
  throw new Error(
    '3plcentral uses per-warehouse client credentials; use credentialFields() instead',
  )
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'clientId', label: 'Client ID', type: 'text', required: true },
    { name: 'clientSecret', label: 'Client Secret', type: 'password', required: true },
    { name: 'userLoginId', label: 'User Login ID (integer)', type: 'text', required: true },
    { name: 'tplKey', label: 'TPL Key (warehouse GUID)', type: 'text', required: false },
    {
      name: 'customerId',
      label: 'Customer ID',
      type: 'text',
      required: false,
      helpText: 'Required to read products; also filters stock, receivers and adjustments.',
    },
    {
      name: 'facilityId',
      label: 'Facility ID',
      type: 'text',
      required: false,
      helpText: 'Required to read locations; also filters stock, receivers and adjustments.',
    },
  ]
}

interface TplFields {
  clientId: string
  clientSecret: string
  userLoginId: string
  tplKey?: string
  customerId?: string
  facilityId?: string
}

function pick(src: Record<string, unknown> | undefined): TplFields {
  const s = (k: string) => {
    const v = src?.[k]
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
  }
  return {
    clientId: s('clientId') ?? '',
    clientSecret: s('clientSecret') ?? '',
    userLoginId: s('userLoginId') ?? '',
    tplKey: s('tplKey'),
    customerId: s('customerId'),
    facilityId: s('facilityId'),
  }
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const f = pick(fields)
  if (!f.clientId || !f.clientSecret || !f.userLoginId) {
    throw new Error('3plcentral requires clientId, clientSecret and userLoginId')
  }
  return fetchToken(f)
}

export async function refreshOAuth2(credentials: Credentials): Promise<Credentials> {
  const f = pick(credentials.extra as Record<string, unknown> | undefined)
  if (!f.clientId || !f.clientSecret || !f.userLoginId) {
    throw new Error('3plcentral: missing extra credentials for token refresh')
  }
  return fetchToken(f)
}

async function fetchToken(f: TplFields): Promise<Credentials> {
  const basic = Buffer.from(`${f.clientId}:${f.clientSecret}`).toString('base64')

  const body: Record<string, string> = {
    grant_type: 'client_credentials',
    user_login_id: f.userLoginId,
  }
  if (f.tplKey) body['tpl'] = `{${f.tplKey}}`

  const { data } = await axios.post<{ access_token: string; expires_in?: number }>(
    TOKEN_URL,
    body,
    {
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/json; charset=utf-8',
        Accept: 'application/json',
      },
      timeout: 15_000,
    },
  )

  const expiresAt = data.expires_in
    ? Date.now() + data.expires_in * 1000 - 60_000 // 1-min buffer
    : Date.now() + 55 * 60 * 1000 // default 55 min

  const extra: Record<string, string> = {
    clientId: f.clientId,
    clientSecret: f.clientSecret,
    userLoginId: f.userLoginId,
    expiresAt: String(expiresAt),
  }
  if (f.tplKey) extra['tplKey'] = f.tplKey
  if (f.customerId) extra['customerId'] = f.customerId
  if (f.facilityId) extra['facilityId'] = f.facilityId

  return { accessToken: data.access_token, extra }
}

export function isTokenExpired(credentials: Credentials): boolean {
  const expiresAt = Number((credentials.extra as Record<string, string>)?.expiresAt ?? 0)
  return Date.now() >= expiresAt
}
