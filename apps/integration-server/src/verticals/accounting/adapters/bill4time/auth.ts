/**
 * Bill4Time authentication helpers.
 *
 * Bill4Time uses API-key auth: the key is embedded directly in every request
 * URL (no OAuth flow, no token exchange, no token refresh).
 *
 * The simpleApiKey credential template in index.ts handles the Connect Link
 * form. These stubs satisfy the BaseAdapter contract so the framework can
 * call them safely without branching.
 */
import type { Credentials } from '../../adapter/interface'

/**
 * Bill4Time does not support an OAuth redirect flow.
 * Returns an empty string so callers that check for an auth URL get a falsy
 * value and fall back to the credential-form path.
 */
export function buildAuthUrl(_state: string): string {
  return ''
}

/**
 * No-op: Bill4Time has no code-exchange step.
 * The API key collected via the credential form is stored directly as
 * `credentials.accessToken`.
 */
export async function exchangeCode(_code: string): Promise<Credentials> {
  return { accessToken: _code }
}

/**
 * API keys do not expire, so there is nothing to refresh.
 * Returns the credentials unchanged.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
