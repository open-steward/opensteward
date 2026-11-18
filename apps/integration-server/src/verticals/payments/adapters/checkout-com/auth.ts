import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_SCOPE, TOKEN_URL } from './constants'

export async function fetchToken(clientId: string, clientSecret: string): Promise<Credentials> {
  const { data } = await axios.post<{
    access_token: string
    expires_in: number
    scope?: string
  }>(
    TOKEN_URL,
    new URLSearchParams({ grant_type: 'client_credentials', scope: DEFAULT_SCOPE }).toString(),
    {
      auth: { username: clientId, password: clientSecret },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    },
  )
  return {
    accessToken: data.access_token,
    scope: data.scope,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    extra: { clientId, clientSecret },
  }
}
