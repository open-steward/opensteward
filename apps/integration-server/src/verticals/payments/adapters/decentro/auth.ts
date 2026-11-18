/**
 * Decentro uses an API-key model with a flat set of header credentials rather
 * than OAuth or a single bearer token:
 *
 *   client_id        — unique id assigned to each client
 *   client_secret    — client-specific secret to access the account
 *   module_secret    — grants access to a product module (e.g. Payments)
 *   provider_secret  — required by some payment endpoints (transaction status,
 *                      UPI refund); optional otherwise
 *
 * These are sent as plain request headers on every call — there is no token
 * exchange and nothing to refresh. We collect them via the Connect Link form
 * (`customForm`) and stash the full set on `credentials.extra` so the client
 * can rebuild the header block. `accessToken` carries `client_id` purely so the
 * stored credential is never empty (the store requires a non-empty token).
 *
 * Docs: https://docs.decentro.tech/docs/testing-credentials
 */
import type { Credentials } from '@opensteward/shared'

export interface DecentroAuthFields {
  clientId: string
  clientSecret: string
  moduleSecret: string
  providerSecret?: string
  environment: string
}

/** Headers Decentro expects on every request. Lower-cased, snake_case wire names. */
export function authHeaders(credentials: Credentials): Record<string, string> {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const headers: Record<string, string> = {
    client_id: String(extra.clientId ?? credentials.accessToken ?? ''),
    client_secret: String(extra.clientSecret ?? ''),
    module_secret: String(extra.moduleSecret ?? ''),
  }
  const provider = extra.providerSecret
  if (provider != null && String(provider) !== '') {
    headers.provider_secret = String(provider)
  }
  return headers
}

/** Resolve the configured environment (`staging` | `production`). */
export function environmentOf(credentials: Credentials): string {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  return String(extra.environment ?? 'staging')
}

/** Validate + pack the Connect Link form into `Credentials`. */
export function buildCredentials(fields: Record<string, string>): Credentials {
  const clientId = (fields.clientId ?? '').trim()
  const clientSecret = fields.clientSecret ?? ''
  const moduleSecret = fields.moduleSecret ?? ''
  if (!clientId || !clientSecret || !moduleSecret) {
    throw new Error('Decentro requires a Client ID, Client Secret, and Module Secret.')
  }
  const providerSecret = (fields.providerSecret ?? '').trim()
  const environment = fields.environment === 'production' ? 'production' : 'staging'
  return {
    accessToken: clientId,
    extra: {
      clientId,
      clientSecret,
      moduleSecret,
      ...(providerSecret ? { providerSecret } : {}),
      environment,
    },
  }
}
