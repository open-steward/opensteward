import type { Credentials } from '../../adapter/interface'

/**
 * inFakt uses static API keys — no OAuth flow.
 * The "code" passed to exchangeCode IS the API key itself.
 * Keys do not expire; refresh is a no-op.
 *
 * Auth header on every request:
 *   X-inFakt-ApiKey: <key>
 *
 * Users generate their key from:
 *   inFakt account → Settings → API
 */

export function buildAuthUrl(_state: string): string {
  // API key auth — no OAuth redirect
  return 'https://app.infakt.pl/account/settings'
}

export async function exchangeCode(code: string): Promise<Credentials> {
  // The "code" is the API key itself
  return { accessToken: code }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Static API keys do not expire
  return credentials
}
