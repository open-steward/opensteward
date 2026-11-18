import axios from 'axios'
import type { Credentials } from '../../adapter/interface'
import { CORREIOS_API_BASE, CORREIOS_DASHBOARD_URL } from './constants'

/**
 * Correios uses a token-based flow: POST /token with cartaoPostagem
 * to obtain a Bearer token.
 */

export function buildAuthUrl(_state: string): string {
  return CORREIOS_DASHBOARD_URL
}

/**
 * Exchange the cartaoPostagem (postal card number) for an access token.
 * The "code" parameter is the cartaoPostagem value.
 */
export async function exchangeApiKey(code: string): Promise<Credentials> {
  const { data } = await axios.post(`${CORREIOS_API_BASE}token`, {
    cartaoPostagem: code,
  })
  return {
    accessToken: data.token ?? data.access_token ?? code,
    expiresAt: data.expiraEm ? new Date(data.expiraEm) : undefined,
    extra: { cartaoPostagem: code },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const cartaoPostagem = (credentials.extra?.cartaoPostagem as string) ?? credentials.accessToken
  return exchangeApiKey(cartaoPostagem)
}

export function authHeader(accessToken: string): string {
  return `Bearer ${accessToken}`
}
