import type { Credentials } from '../../adapter/interface'

// Xledger uses API token authentication for its GraphQL API.
// Tokens are generated in the Xledger UI:
//   Administration > System Access > GraphQL > API Tokens
// The token is used as: Authorization: token <hash>
//
// There is no OAuth2 flow. The "code" exchange accepts the API token directly.

export function buildAuthUrl(_state: string): string {
  return 'https://www.xledger.net/f/api-tokens'
}

export async function exchangeCode(apiToken: string): Promise<Credentials> {
  return {
    accessToken: apiToken,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Xledger API tokens do not expire automatically — return as-is
  return credentials
}
