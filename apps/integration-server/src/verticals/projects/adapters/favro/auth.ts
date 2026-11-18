import type { Credentials } from '@opensteward/shared'
import { TOKEN_HELP_URL } from './constants'

/**
 * Favro authenticates with HTTP Basic Auth: the user's account email as the
 * username and a personal API token as the password
 * (`Authorization: Basic base64(email:apiToken)`). There is no OAuth2
 * authorization-code flow for first-party API access, so credentials are
 * collected through the Connect Link form (the `customForm` helper wired up in
 * `index.ts`): three fields — `email`, `apiToken`, and `organizationId`.
 *
 * The API token is stored as `accessToken`; the email and organization id are
 * stored on `extra` because every organization-scoped request also requires an
 * `organizationId` HTTP header and the email half of the Basic credential.
 */

/** Connect Link form has no redirect URL — point users at the token docs. */
export function buildAuthUrl(_state: string): string {
  return TOKEN_HELP_URL
}

/** Favro API tokens are long-lived and do not refresh — return as-is. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
