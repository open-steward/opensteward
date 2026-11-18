import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('infocert uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiKey',
      label: 'GoSign access token',
      type: 'password',
      required: true,
      helpText:
        'A GoSign OAuth2 access token. The GoSign5 API documents its token endpoint as https://gosign-be.infocert.it/gosign/oauth/token (authorization-code or password flow).',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  if (!apiKey) throw new Error('infocert credentialFields require apiKey')
  return { accessToken: apiKey, extra: {} }
}
