/**
 * Salt Edge auth (api_key model).
 *
 * Every Account Information API request carries two headers: `App-id` and
 * `Secret`, taken from a key generated in the Salt Edge client dashboard
 * (https://www.saltedge.com/clients/profile/secrets). There is no OAuth and
 * no token exchange — the App-id / Secret pair *is* the credential.
 *
 * We carry the App-id in `accessToken` and the Secret in `extra.secret`, so
 * the client can rebuild both headers on every call.
 */
import type { Credentials } from '@opensteward/shared'

export function buildCredentials(fields: Record<string, string>): Credentials {
  const appId = (fields.appId ?? '').trim()
  const secret = (fields.secret ?? '').trim()
  if (!appId) throw new Error('Salt Edge App-id is required.')
  if (!secret) throw new Error('Salt Edge Secret is required.')
  return {
    accessToken: appId,
    extra: { secret },
  }
}

/** Extract the (App-id, Secret) pair from stored credentials. */
export function readCredentials(credentials: Credentials): { appId: string; secret: string } {
  return {
    appId: credentials.accessToken ?? '',
    secret: String((credentials.extra as Record<string, unknown> | undefined)?.secret ?? ''),
  }
}
