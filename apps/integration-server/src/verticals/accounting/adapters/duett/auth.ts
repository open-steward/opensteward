import type { Credentials } from '../../adapter/interface'

// Duett uses API key authentication — two headers per request:
//   X-Api-Integration-Key: identifies the integration (constant per integration type)
//   X-Api-Client-Key:      identifies the end-user company instance
//
// There is no OAuth2 flow. The "code" exchange stores the integration key;
// the client key is expected in credentials.tenantId.

export function buildAuthUrl(_state: string): string {
  // No OAuth redirect — direct user to Duett settings to obtain keys
  return 'https://api.duett.no/documentation'
}

export async function exchangeCode(
  integrationKey: string,
  _clientId?: string,
  _clientSecret?: string,
): Promise<Credentials> {
  // integrationKey is stored as the accessToken
  return {
    accessToken: integrationKey,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // API keys do not expire
  return credentials
}
