// MyUnisoft uses a partner key (X-Third-Party-Secret) + JWT token model,
// not a standard OAuth2 authorization-code flow.
// Partners are issued an X-Third-Party-Secret by MyUnisoft.
// A firm-scoped JWT token is obtained by calling the authentication endpoint
// with the partner key and firm credentials.
import type { Credentials } from '../../adapter/interface'

// Stub: direct users to the MyUnisoft partner portal to obtain credentials.
export function buildAuthUrl(_state: string): string {
  return 'https://partners.api.myunisoft.fr/'
}

export async function exchangeCode(code: string): Promise<Credentials> {
  // `code` carries the partner-issued JWT token when using the partner auth flow.
  return { accessToken: code }
}

export async function refreshAccessToken(
  _refreshToken: string,
  _clientId: string,
  _clientSecret: string,
): Promise<Credentials> {
  // JWT tokens must be refreshed via the MyUnisoft partner API endpoint directly.
  throw new Error('MyUnisoft token refresh must be handled via the partner authentication endpoint.')
}
