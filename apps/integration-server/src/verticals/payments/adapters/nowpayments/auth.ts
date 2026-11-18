import type { Credentials } from '@opensteward/shared'

/**
 * NOWPayments authenticates with the `x-api-key` header ("(Required)  Your
 * NOWPayments API key"). A few endpoints also need a JWT from POST /v1/auth,
 * which takes "your email and password which you are using for signing in
 * into dashboard"; "JWT token will be required for using 'Get list of
 * payments' and 'Create payout' endpoints. For security reasons, JWT tokens
 * expire in 5 minutes." The customer (sub-partner) endpoints take only that
 * JWT. https://documenter.getpostman.com/view/7907941/2s93JusNJt
 *
 * So the API key is the access token, and the dashboard e-mail and password
 * are kept (optional) for the JWT-only lists. A token lives five minutes, so
 * the credentials themselves are stored, not a token.
 */
export function buildCredentials(fields: Record<string, string>): Credentials {
  const apiKey = fields.apiKey
  if (!apiKey) throw new Error('NOWPayments: an API key is required.')
  const extra: Record<string, string> = {}
  if (fields.email) extra.email = fields.email
  if (fields.password) extra.password = fields.password
  return Object.keys(extra).length ? { accessToken: apiKey, extra } : { accessToken: apiKey }
}

/** The dashboard e-mail and password, or undefined when the connection has none. */
export function dashboardLogin(
  credentials: Credentials,
): { email: string; password: string } | undefined {
  const email = credentials.extra?.email
  const password = credentials.extra?.password
  if (typeof email !== 'string' || !email || typeof password !== 'string' || !password)
    return undefined
  return { email, password }
}
