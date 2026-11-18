/**
 * eGestor authentication.
 *
 * Auth model: api_key (personal_token).
 * The user obtains a `personal_token` from their eGestor account settings
 * (Settings → API tab). To call the API they exchange it for a short-lived
 * Bearer access_token via `POST /api/oauth/access_token`.
 *
 * exchangeCode: accepts the personal_token as the "code", exchanges it for
 *   an access_token, and stores the personal_token as the refresh_token so
 *   it can be re-exchanged when the access_token expires (TTL: 900 s).
 *
 * refreshCredentials: re-exchanges the stored personal_token for a fresh
 *   access_token.
 */

import axios from 'axios'
import { EGESTOR_OAUTH_URL } from './constants'
import type { Credentials } from '../../adapter/interface'

interface OAuthTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
}

export function buildAuthUrl(_state: string): string {
  // eGestor uses a personal_token obtained from the web UI — no browser
  // redirect flow. Return the settings URL so users know where to find it.
  return 'https://app.egestor.com.br/#!/configuracoes/api'
}

export async function exchangeCode(personalToken: string): Promise<Credentials> {
  const { data } = await axios.post<OAuthTokenResponse>(
    EGESTOR_OAUTH_URL,
    new URLSearchParams({
      grant_type: 'personal',
      personal_token: personalToken,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )
  return {
    accessToken: data.access_token,
    // Store the personal_token as refreshToken so we can re-exchange later
    refreshToken: personalToken,
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
  }
}

export async function refreshAccessToken(personalToken: string): Promise<Credentials> {
  return exchangeCode(personalToken)
}
