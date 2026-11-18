/**
 * vhsys authentication — API key pair model.
 *
 * Credentials are provided as two tokens stored in the vhsys account settings:
 *   access-token        — identifies the tenant
 *   secret-access-token — secret credential
 *
 * Both tokens are issued once (no expiry, no refresh) and sent on every
 * request as custom headers.  We store them in `credentials.accessToken`
 * (the public access token) and `credentials.extra.secretAccessToken`.
 */
import type { Credentials } from '../../adapter/interface'

export function getAuthUrl(_state: string): string {
  // vhsys does not use OAuth — return a sentinel so the adapter satisfies
  // the BaseAdapter interface without breaking callers that check for '#'.
  return '#'
}

export async function exchangeCode(code: string): Promise<Credentials> {
  // When using the simpleApiKey Connect Link flow the code is
  // "accessToken:secretAccessToken" (colon-separated).
  // If there is no colon we treat the whole value as the access token.
  const sep = code.indexOf(':')
  if (sep === -1) {
    return { accessToken: code }
  }
  const accessToken = code.slice(0, sep)
  const secretAccessToken = code.slice(sep + 1)
  return {
    accessToken,
    extra: { secretAccessToken },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // API key pairs do not expire — return unchanged.
  return credentials
}
