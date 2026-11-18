import type { Credentials } from '../../adapter/interface'

// Morning / Green Invoice uses API Key + Secret (Basic Auth).
// No OAuth2 flow. The "code" param is "apiKey:apiSecret" (colon-separated).

export function getAuthUrl(_state: string): string {
  return '#'
}

export async function exchangeCode(code: string): Promise<Credentials> {
  const colonIdx = code.indexOf(':')
  if (colonIdx === -1) {
    // Treat entire code as apiKey with no secret
    return { accessToken: code }
  }
  const apiKey = code.slice(0, colonIdx)
  const apiSecret = code.slice(colonIdx + 1)
  return {
    accessToken: apiKey,
    extra: { apiSecret },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // API key/secret pairs do not expire
  return credentials
}
