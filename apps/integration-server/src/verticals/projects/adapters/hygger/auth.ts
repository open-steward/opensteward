/**
 * Hygger connection form (kept as a single-token form; see below).
 *
 * This form does NOT match the documented auth, and nothing is sent with it:
 * every read method of the adapter refuses with 501 before any request.
 *
 * The API Blueprint (https://jsapi.apiary.io/apis/hygger.apib) documents an
 * authorization-code exchange, not a static key:
 *   "Request should happen in a browser on a URL
 *    https://accounts.hygger.io/api-access/{application-key}"
 *   "you can use the auth_code to obtain the permanent access token to API by
 *    sending a POST request for authorization"
 *   "### Create authorization [POST /authorization{?expand}]"
 * and the resulting token is sent as
 *   "Authorization: Bearer <token>"
 * Reviving the adapter needs that flow (auth_type oauth2) plus a company id,
 * which the live host requires on every read; see index.ts.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'
import { simpleApiKey } from '@opensteward/shared'

const FORM = simpleApiKey({
  label: 'API Key',
  placeholder: 'your-hygger-api-key',
  helpText: 'Generate at https://hygger.io/for-developers/ (Developer Settings)',
})

export function getAuthUrlUnsupported(): never {
  throw new Error('hygger uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return FORM.credentialFields()
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  return FORM.exchangeCredentials(fields)
}
