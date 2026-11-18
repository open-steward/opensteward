/**
 * Process Street API key authentication.
 *
 * Process Street uses an X-API-Key header:
 *   X-API-Key: <api_key>
 *
 * API keys are generated in Settings → Integrations → API.
 * Only organization admins can create API keys.
 *
 * Docs: https://public-api.process.st/api/v1.1/docs/index.html
 */
import type { Credentials, CredentialField } from '@opensteward/shared'
import { simpleApiKey } from '@opensteward/shared'

const FORM = simpleApiKey({
  label: 'API Key',
  placeholder: 'Your Process Street API key',
  helpText: 'Find your API key in Settings → Integrations → API. Administrator access required.',
})

export function getAuthUrlUnsupported(): never {
  throw new Error('process-street uses API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return FORM.credentialFields()
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  return FORM.exchangeCredentials(fields)
}
