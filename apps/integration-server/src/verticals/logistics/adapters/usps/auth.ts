import axios from 'axios'
import type { Credentials } from '../../adapter/interface'
import { USPS_DASHBOARD_URL, USPS_TOKEN_URL } from './constants'

export function buildAuthUrl(_state: string): string {
  return USPS_DASHBOARD_URL
}

export async function exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
  // "code" is expected to be "client_id:client_secret"
  const [clientId, clientSecret] = code.split(':')
  const { data } = await axios.post(USPS_TOKEN_URL, {
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  })

  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + parseInt(data.expires_in, 10) * 1000),
    scope: data.scope,
    extra: { clientId, clientSecret },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const clientId = (credentials.extra as Record<string, string>)?.clientId
  const clientSecret = (credentials.extra as Record<string, string>)?.clientSecret
  if (!clientId || !clientSecret) return credentials

  const { data } = await axios.post(USPS_TOKEN_URL, {
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  })

  return {
    ...credentials,
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + parseInt(data.expires_in, 10) * 1000),
  }
}

export function authHeader(accessToken: string): string {
  return `Bearer ${accessToken}`
}
