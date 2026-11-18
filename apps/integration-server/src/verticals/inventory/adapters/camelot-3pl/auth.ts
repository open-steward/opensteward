import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('camelot-3pl uses an API key; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'baseUrl',
      label: 'Webservice Base URL',
      type: 'text',
      required: true,
      // e.g. https://wms.yourcompany.com/ExcaliburAPI
    },
    {
      name: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
    },
    {
      name: 'clientCode',
      label: 'Client Code',
      type: 'text',
      required: true,
      // The warehouse client/customer code assigned by the 3PL operator.
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const baseUrl = fields['baseUrl']
  const apiKey = fields['apiKey']
  const clientCode = fields['clientCode']
  if (!baseUrl || !apiKey || !clientCode) {
    throw new Error('camelot-3pl credentialFields require baseUrl, apiKey, and clientCode')
  }
  return {
    accessToken: apiKey,
    extra: { baseUrl: baseUrl.replace(/\/$/, ''), clientCode },
  }
}
