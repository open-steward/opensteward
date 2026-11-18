import type { Credentials } from '../../adapter/interface'

// FlowAccount uses API key authentication — there is no OAuth2 flow.
// The "code" is the API key itself.

export function buildAuthUrl(_state: string): string {
  return '#'
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return {
    accessToken: code,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // FlowAccount API keys do not expire — return as-is
  return credentials
}
