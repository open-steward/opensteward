/**
 * eSignly auth helpers — API key only.
 *
 * eSignly authenticates every request with a static `api_key` submitted as a
 * request parameter (no bearer header, no OAuth). The Connect Link form
 * collects the key once; `getAuthUrl` / `exchangeCode` throw because there is
 * no authorization-code flow.
 *
 * Docs: https://www.esignly.com/esignly-api.html
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiKey',
      label: 'eSignly API key',
      type: 'password',
      placeholder: 'Your eSignly API key',
      helpText:
        'In eSignly, open your account API settings (or visit the API plan page) to generate a key. The adapter submits it as the api_key request parameter.',
      required: true,
    },
  ]
}

export async function exchangeCredentials(
  fields: Record<string, string>,
): Promise<Credentials> {
  const apiKey = (fields.apiKey ?? '').trim()
  if (!apiKey) throw new Error('eSignly API key is required.')
  return { accessToken: apiKey }
}
