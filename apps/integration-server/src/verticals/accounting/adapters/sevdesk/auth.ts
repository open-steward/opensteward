import type { Credentials } from '../../adapter/interface'

// sevDesk uses API Token auth — not OAuth 2.0.
// The token is passed as the Authorization header value.
// We repurpose the OAuth code exchange to store the API token directly.

export function buildAuthUrl(_clientId: string, _redirectUri: string, _scopes: string[], state: string): string {
  return `https://my.sevdesk.de/api-key?state=${encodeURIComponent(state)}`
}

// "code" is the sevDesk API token (32-char hex string)
export function exchangeCode(code: string): Credentials {
  return {
    accessToken: code,
    // API tokens don't expire
  }
}

export function refreshCredentials(credentials: Credentials): Credentials {
  // API tokens don't expire; no-op
  return credentials
}
