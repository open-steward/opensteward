/**
 * Billie auth — OAuth2 client-credentials grant.
 *
 * Billie has no end-user OAuth (no authorize/redirect). Instead the merchant
 * downloads a `client_id` + `client_secret` pair from the Billie Merchant
 * Dashboard ("Developer" section) and exchanges them at `oauth/token` for a
 * short-lived JWT bearer token. Tokens expire after ~8 hours, so the adapter
 * re-runs the grant on refresh. The slug is registered as `api_key` because
 * the customer pastes a static secret into the Connect Link form — the
 * client-credentials exchange happens entirely server-side.
 *
 * Sandbox and production are separate hosts; the customer selects which one
 * the credentials belong to via the `environment` form field, and that choice
 * is stashed on `credentials.extra` so both the API client and the refresh
 * path can reconstruct the right host.
 *
 * Docs: https://docs.billie.io/reference/authentication
 */
import type { Credentials, CredentialField } from '@opensteward/shared'
import { oauth2ClientCredentials } from '@opensteward/shared'
import { PRODUCTION_TOKEN_URL, SANDBOX_TOKEN_URL } from './constants'

export type BillieEnvironment = 'production' | 'sandbox'

const ENVIRONMENT_FIELD: CredentialField = {
  name: 'environment',
  label: 'Environment',
  type: 'select',
  required: true,
  helpText: 'Pick the Billie environment your client credentials belong to.',
  options: [
    { value: 'production', label: 'Production' },
    { value: 'sandbox', label: 'Sandbox' },
  ],
}

/** Resolve the token endpoint for the environment the customer picked. */
export function tokenUrlFor(environment: string | undefined): string {
  return environment === 'sandbox' ? SANDBOX_TOKEN_URL : PRODUCTION_TOKEN_URL
}

/**
 * Connect-Link form descriptor + server-side exchange. `clientId` and
 * `clientSecret` come from the shared client-credentials template; the
 * `environment` selector is appended so the exchange can target the right
 * host and so the choice round-trips on `credentials.extra`.
 */
export const BILLIE_CREDENTIAL_FORM = oauth2ClientCredentials({
  tokenUrl: (fields) => tokenUrlFor(fields.environment),
  additionalFields: [ENVIRONMENT_FIELD],
  buildExtra: (fields) => ({
    clientId: fields.clientId,
    clientSecret: fields.clientSecret,
    environment: fields.environment === 'sandbox' ? 'sandbox' : 'production',
  }),
})

/**
 * Re-run the client-credentials grant. Billie JWTs are short-lived (~8h) and
 * carry no refresh token, so we mint a fresh one from the stored client
 * credentials + environment.
 */
export async function refreshBillieCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = credentials.extra ?? {}
  const clientId = typeof extra.clientId === 'string' ? extra.clientId : undefined
  const clientSecret = typeof extra.clientSecret === 'string' ? extra.clientSecret : undefined
  const environment = typeof extra.environment === 'string' ? extra.environment : 'production'
  if (!clientId || !clientSecret) return credentials
  return BILLIE_CREDENTIAL_FORM.exchangeCredentials({ clientId, clientSecret, environment })
}
