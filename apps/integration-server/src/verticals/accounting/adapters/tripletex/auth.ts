import axios from 'axios'
import { TRIPLETEX_SESSION_URL } from './constants'
import type { Credentials } from '../../adapter/interface'

// Tripletex uses consumer token + employee token to generate a session token.
// We encode both in the "code" as "consumerToken:employeeToken" to fit the OAuth interface.

export function buildAuthUrl(_clientId: string, _redirectUri: string, _scopes: string[], state: string): string {
  // Tripletex is not OAuth-based. The "auth URL" is a placeholder.
  // Operators should provide the consumer token and employee token directly.
  return `https://tripletex.no/execute/integrationConfig?state=${encodeURIComponent(state)}`
}

async function createSession(consumerToken: string, employeeToken: string): Promise<string> {
  // Session expires in 1 day
  const expirationDate = new Date(Date.now() + 86400 * 1000).toISOString().split('T')[0]
  const { data } = await axios.put<{ value: { token: string } }>(
    TRIPLETEX_SESSION_URL,
    null,
    {
      params: { consumerToken, employeeToken, expirationDate },
      headers: { Accept: 'application/json' },
    },
  )
  return data.value.token
}

function sessionBasicAuth(sessionToken: string): string {
  return Buffer.from(`0:${sessionToken}`).toString('base64')
}

// The "code" is formatted as "consumerToken:employeeToken"
export async function exchangeCode(code: string): Promise<Credentials> {
  const colonIdx = code.indexOf(':')
  if (colonIdx === -1) {
    throw new Error('Tripletex code must be "consumerToken:employeeToken"')
  }
  const consumerToken = code.slice(0, colonIdx)
  const employeeToken = code.slice(colonIdx + 1)
  const sessionToken = await createSession(consumerToken, employeeToken)
  return {
    accessToken: sessionBasicAuth(sessionToken),
    refreshToken: employeeToken,
    expiresAt: new Date(Date.now() + 86400 * 1000),
    extra: { consumerToken },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const consumerToken = credentials.extra?.['consumerToken'] as string | undefined
  const employeeToken = credentials.refreshToken
  if (!consumerToken || !employeeToken) {
    throw new Error('Missing consumerToken or employeeToken for Tripletex token refresh')
  }
  const sessionToken = await createSession(consumerToken, employeeToken)
  return {
    accessToken: sessionBasicAuth(sessionToken),
    refreshToken: employeeToken,
    expiresAt: new Date(Date.now() + 86400 * 1000),
    extra: { consumerToken },
  }
}
