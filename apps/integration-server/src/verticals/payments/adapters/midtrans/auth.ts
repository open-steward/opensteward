/**
 * Midtrans authenticates with HTTP **Basic** auth: the merchant Server Key is
 * the username and the password is empty — i.e. `Authorization: Basic
 * base64("<ServerKey>:")` (note the trailing colon). There is no OAuth flow
 * and no refresh token; the Server Key is the credential, so we stash it
 * verbatim on `accessToken`.
 *
 * One key is bound to one environment (an `SB-Mid-server-…` key targets
 * sandbox, a `Mid-server-…` key targets production), but the **host** also
 * differs between environments, so the chosen environment is carried on
 * `credentials.extra.environment` and resolved to a base URL by the client.
 *
 * Docs: https://docs.midtrans.com/docs/api-authorization-headers
 */
import type { Credentials } from '@opensteward/shared'
import type { MidtransEnvironment } from './constants'

export function buildCredentials(fields: Record<string, string>): Credentials {
  const environment: MidtransEnvironment =
    (fields.environment ?? '').toLowerCase() === 'production' ? 'production' : 'sandbox'
  return {
    accessToken: (fields.serverKey ?? '').trim(),
    extra: { environment },
  }
}

/** The environment recorded on the credentials (defaults to sandbox). */
export function environmentOf(credentials: Credentials): string {
  const env = (credentials.extra as { environment?: string } | undefined)?.environment
  return typeof env === 'string' ? env : 'sandbox'
}
