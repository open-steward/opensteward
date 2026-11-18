import axios from 'axios'
import { NUVEMFISCAL_TOKEN_URL } from './constants'
import type { Credentials } from '../../adapter/interface'

// NuvemFiscal uses OAuth 2.0 client_credentials flow only — no authorization code flow.
// Docs: https://dev.nuvemfiscal.com.br/docs/autenticacao/

export function buildAuthUrl(
  _clientId: string,
  _redirectUri: string,
  _scopes: string[],
  _state: string,
): string {
  // NuvemFiscal does not support authorization code flow.
  return 'https://dev.nuvemfiscal.com.br/docs/'
}

function parseTokenResponse(data: Record<string, unknown>): Credentials {
  return {
    accessToken: data['access_token'] as string,
    expiresAt: new Date(Date.now() + (data['expires_in'] as number) * 1000),
    scope: data['scope'] as string | undefined,
  }
}

export async function exchangeCode(
  _code: string,
  clientId: string,
  clientSecret: string,
  _redirectUri: string,
): Promise<Credentials> {
  // NuvemFiscal does not use authorization codes — obtain token via client_credentials.
  return getClientCredentialsToken(clientId, clientSecret)
}

export async function getClientCredentialsToken(
  clientId: string,
  clientSecret: string,
  scopes?: string[],
): Promise<Credentials> {
  const params: Record<string, string> = {
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  }
  if (scopes && scopes.length > 0) {
    params['scope'] = scopes.join(' ')
  }
  const { data } = await axios.post<Record<string, unknown>>(
    NUVEMFISCAL_TOKEN_URL,
    new URLSearchParams(params),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )
  return parseTokenResponse(data)
}

export async function refreshAccessToken(
  _refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  // NuvemFiscal does not issue refresh tokens — re-obtain via client_credentials.
  return getClientCredentialsToken(clientId, clientSecret)
}
