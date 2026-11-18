/**
 * IntaSend authenticates protected requests with a **secret API token** sent
 * as a Bearer token: `Authorization: Bearer <ISSecretKey_…>`. The secret key
 * must only be used server-side.
 *
 * Many collection / payment-status calls additionally require the **public
 * key** (`ISPubKey_…`) in the request body to identify the business — it is
 * not an auth header, just a business identifier, so we carry it on
 * `credentials.extra.publishableKey`.
 *
 * The key pair is bound to one environment: sandbox keys only work against
 * `sandbox.intasend.com`, live keys only against `payment.intasend.com`. The
 * caller picks the environment with a `sandbox` form flag, which we persist on
 * `credentials.extra.sandbox`. There is no OAuth flow and no refresh — the
 * secret key is the credential, stashed verbatim on `accessToken`.
 *
 * Docs: https://developers.intasend.com/docs/authentication
 */
import type { Credentials } from '@opensteward/shared'

export interface IntasendExtra {
  /** ISPubKey_… — business identifier sent in collection request bodies. */
  publishableKey?: string
  /** Route requests at the sandbox host when true. */
  sandbox: boolean
}

export function buildCredentials(fields: Record<string, string>): Credentials {
  const secretKey = (fields.secretKey ?? '').trim()
  if (!secretKey) throw new Error('IntaSend secret API key is required.')
  const extra: IntasendExtra = {
    publishableKey: (fields.publishableKey ?? '').trim() || undefined,
    sandbox: parseBool(fields.sandbox),
  }
  return { accessToken: secretKey, extra: extra as unknown as Record<string, unknown> }
}

/** Read the environment flag off stored credentials (defaults to live). */
export function isSandbox(credentials: Credentials): boolean {
  return parseBool((credentials.extra as IntasendExtra | undefined)?.sandbox)
}

/** Read the stored public key (used as a body field on collection calls). */
export function publishableKey(credentials: Credentials): string | undefined {
  const pk = (credentials.extra as IntasendExtra | undefined)?.publishableKey
  return typeof pk === 'string' && pk ? pk : undefined
}

function parseBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') return v.trim().toLowerCase() === 'true'
  return false
}
