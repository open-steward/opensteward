import type { CredentialField, Credentials } from '@opensteward/shared'

/**
 * "You can authenticate by simply passing your API Secret via the HTTP header
 * X-API-KEY: YOUR_API_SECRET", and every call names the instance: "The basic
 * URL to our API is: https://api.payrexx.com/v1.0/:object/:id?instance=:instance"
 * where the instance is "The Payrexx instance name. If you access your Payrexx
 * payment page with example.payrexx.com, the name would be example"
 * (https://developers.payrexx.com/reference/rest-api.md).
 */
export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiKey',
      label: 'API Secret',
      type: 'password',
      required: true,
    },
    {
      name: 'instance',
      label: 'Instance name',
      type: 'text',
      required: true,
      placeholder: 'example',
      helpText:
        'If you access your Payrexx payment page with example.payrexx.com, the name is "example".',
    },
  ]
}

export function buildCredentials(fields: Record<string, string>): Credentials {
  const apiKey = (fields.apiKey ?? '').trim()
  const instance = (fields.instance ?? '').trim()
  if (!apiKey) throw new Error('Payrexx API Secret is required.')
  if (!instance) throw new Error('Payrexx instance name is required.')
  return { accessToken: apiKey, extra: { instance } }
}

/**
 * The instance every request must carry. A connection made before the
 * instance was collected has none, and no request can succeed without it.
 */
export function readInstance(credentials: Credentials): string {
  const instance = credentials.extra?.['instance']
  if (typeof instance !== 'string' || !instance) {
    throw Object.assign(
      new Error(
        'Payrexx requires the instance name on every request ("?instance=:instance"); ' +
          'this connection has none. Reconnect Payrexx with its instance name.',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }
  return instance
}
