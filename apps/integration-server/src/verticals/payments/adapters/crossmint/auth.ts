/**
 * Crossmint auth — a single server-side API key.
 *
 * Crossmint has no OAuth flow for server-to-server access: every request
 * carries an `X-API-KEY` header. Keys are environment-scoped — staging keys
 * begin `sk_staging_…`, production keys `sk_production_…` — and the client
 * derives the base URL from that prefix.
 *
 * We reuse the shared `simpleApiKey` credential-form template (Connect Link
 * flow) so the key is collected as a single password field and stored on
 * `credentials.accessToken`.
 *
 * Docs: https://docs.crossmint.com/introduction/platform/api-keys/overview
 */
import { simpleApiKey } from '@opensteward/shared'

export const CROSSMINT_CREDENTIAL_FORM = simpleApiKey({
  fieldName: 'apiKey',
  label: 'Server API key',
  placeholder: 'sk_production_… or sk_staging_…',
  helpText:
    'Server-side key from the Crossmint console (Settings → API keys). Production keys start sk_production_; staging keys start sk_staging_.',
})
