/**
 * Validator for the `?redirect_uri=` query param on the OAuth-start
 * route. The provider will return the user's auth code to this URL, so
 * letting a caller specify an arbitrary value lets them harvest codes.
 *
 * Rule: when a `redirect_uri` is supplied it must point back to *this*
 * deployment's callback path. Same origin AND matching path are both
 * required.
 *
 *   ✓  https://api.example.com/auth/crm/hubspot/callback
 *   ✗  https://attacker.example/auth/crm/hubspot/callback   (origin)
 *   ✗  https://api.example.com/somewhere-else                (path)
 *
 * Operators who legitimately need to send the callback elsewhere
 * (e.g. a Connect-Link landing page on the admin app) should set
 * `extraAllowedRedirectHosts` on the router options — the host part
 * is matched verbatim against the URL's `host`, the path still has to
 * be the standard callback shape.
 */

export interface ValidateRedirectUriOptions {
  /** Path the redirect must end with — e.g. `/auth/crm/hubspot/callback`. */
  expectedPath: string
  /**
   * Base URL of this deployment (origin + optional path prefix). The
   * redirect URI must share the origin unless it appears in
   * `extraAllowedHosts`.
   */
  deploymentOrigin: string
  /**
   * Optional extra hosts (host:port form, without scheme) that may
   * appear in the redirect URI. Mainly useful for split deployments
   * where the OAuth start lives on one host and the callback on
   * another (rare).
   */
  extraAllowedHosts?: ReadonlyArray<string>
}

export class InvalidRedirectUriError extends Error {
  readonly redirectUri: string
  readonly reason: string
  constructor(redirectUri: string, reason: string) {
    super(`invalid redirect_uri: ${reason}`)
    this.name = 'InvalidRedirectUriError'
    this.redirectUri = redirectUri
    this.reason = reason
  }
}

export function validateRedirectUri(redirectUri: string, opts: ValidateRedirectUriOptions): void {
  let parsed: URL
  try {
    parsed = new URL(redirectUri)
  } catch {
    throw new InvalidRedirectUriError(redirectUri, 'not a valid absolute URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new InvalidRedirectUriError(redirectUri, `unsupported scheme '${parsed.protocol}'`)
  }
  // The deployment origin may be a plain origin or include a path
  // prefix; we just care about the host:port for the allow-list.
  let deploymentHost: string
  try {
    deploymentHost = new URL(opts.deploymentOrigin).host
  } catch {
    throw new InvalidRedirectUriError(redirectUri, 'deployment origin is not a valid URL')
  }
  const allowedHosts = new Set<string>([deploymentHost, ...(opts.extraAllowedHosts ?? [])])
  if (!allowedHosts.has(parsed.host)) {
    throw new InvalidRedirectUriError(
      redirectUri,
      `host '${parsed.host}' is not in the allow-list (${[...allowedHosts].join(', ')})`,
    )
  }
  if (parsed.pathname !== opts.expectedPath) {
    throw new InvalidRedirectUriError(
      redirectUri,
      `path '${parsed.pathname}' does not match expected '${opts.expectedPath}'`,
    )
  }
}

export function isValidRedirectUri(redirectUri: string, opts: ValidateRedirectUriOptions): boolean {
  try {
    validateRedirectUri(redirectUri, opts)
    return true
  } catch {
    return false
  }
}
