import type { Credentials } from '../../adapter/interface'

// Lexoffice uses API Key auth (Bearer token) — not OAuth 2.0.
// Requires the XL plan or higher.

export function buildAuthUrl(_clientId: string, _redirectUri: string, _scopes: string[], state: string): string {
  return `https://app.lexoffice.de/addons/public-api?state=${encodeURIComponent(state)}`
}

// "code" is the Lexoffice API key
export function exchangeCode(code: string): Credentials {
  return { accessToken: code }
}

export function refreshCredentials(credentials: Credentials): Credentials {
  return credentials
}
