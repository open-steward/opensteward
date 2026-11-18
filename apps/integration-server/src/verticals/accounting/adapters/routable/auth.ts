/**
 * Routable auth — API key (token) model.
 *
 * Routable does not use OAuth2. Users generate an API token from the Routable
 * Dashboard (production: https://app.routable.com, sandbox:
 * https://app.sandbox.routable.com) and present it as a Bearer token in the
 * Authorization header with every request.
 *
 * Docs: https://developers.routable.com/docs/your-api-token
 */
import type { Credentials } from '../../adapter/interface'

// The URL where users generate their API token (used as the "auth" redirect).
export const ROUTABLE_API_KEY_URL = 'https://app.routable.com/settings/developer'

export function buildAuthUrl(_state: string): string {
  return ROUTABLE_API_KEY_URL
}

/**
 * exchangeCode — for API-key auth the "code" IS the API token itself.
 * The Connect-Link form passes it straight through; no HTTP round-trip needed.
 */
export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: code }
}

/**
 * Routable API tokens do not expire; return credentials unchanged.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
