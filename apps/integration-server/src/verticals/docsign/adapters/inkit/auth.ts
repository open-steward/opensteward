/**
 * Inkit auth.
 *
 * Inkit authenticates with a static API token (the `X-Inkit-API-Token`
 * header), so there is no OAuth flow. The Connect Link credential-form
 * path is satisfied by the shared `simpleApiKey` template: a single
 * password field whose value is stored as the access token and replayed
 * on every request by the client.
 *
 * Docs: https://docs.inkit.com/docs/managing-api-keys
 */
import { simpleApiKey } from '@opensteward/shared'

export const FORM = simpleApiKey({
  fieldName: 'apiKey',
  label: 'API token',
  helpText: 'Found in Inkit under Settings → API Keys. Sent as the X-Inkit-API-Token header.',
})

export function getAuthUrlUnsupported(): never {
  throw new Error('inkit uses a static API token; use credentialFields() instead')
}
