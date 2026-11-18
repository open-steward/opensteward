/**
 * Zenvia Customer Cloud auth helpers.
 *
 * The Customer Cloud API uses a static API key passed as an `api-key` query
 * parameter on every request.  The key is provisioned from the platform's
 * App Marketplace ("API access" app) and does not expire.
 *
 * OAuth 2.0 is supported by Zenvia only for *outbound* webhook delivery (the
 * platform can obtain a token from the subscriber's auth server before sending
 * webhook payloads), not for the REST API itself.  This adapter therefore
 * models auth as a simple API-key credential form.
 *
 * Docs: https://sales.zenvia.com/ (checkCredentials endpoint)
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('zenvia uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      helpText:
        'Your Zenvia Customer Cloud API key. Generate one by installing the "API access" app from the Zenvia Customer Cloud App Marketplace.',
    },
  ]
}

export async function exchangeCredentials(
  fields: Record<string, string>,
): Promise<Credentials> {
  const apiKey = fields['apiKey']
  if (!apiKey) throw new Error('zenvia: credentialFields require apiKey')
  return { accessToken: apiKey, extra: {} }
}
