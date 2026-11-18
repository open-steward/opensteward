/**
 * Trolley credential model.
 *
 * "All calls to the Trolley API require authentication. You will need to get
 * an access key and secret key from the dashboard via the settings page."
 * Each request is signed with the secret key: "API Key authentication requires
 * each request to be signed, this ensures that your secret key is not part of
 * the transmission." (https://developers.trolley.com/api/#authentication)
 *
 * Mapped onto `Credentials` as:
 *   - `accessToken`      → access key (sent in `Authorization: prsign ACCESS_KEY:SIGNATURE`)
 *   - `extra.secretKey`  → secret key (the HMAC-SHA256 signing key, never sent)
 */
import type { CredentialField, Credentials } from '@opensteward/shared'

export const CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'accessKey',
    label: 'Access key',
    type: 'text',
    required: true,
    helpText: 'From the settings page of your Trolley dashboard.',
  },
  {
    name: 'secretKey',
    label: 'Secret key',
    type: 'password',
    required: true,
    helpText: 'From the settings page of your Trolley dashboard, alongside the access key.',
  },
]

export function buildCredentials(fields: Record<string, string>): Credentials {
  const accessKey = fields['accessKey']?.trim() ?? ''
  const secretKey = fields['secretKey']?.trim() ?? ''
  if (!accessKey || !secretKey) {
    throw new Error('Trolley needs both an access key and a secret key to sign requests.')
  }
  return { accessToken: accessKey, extra: { secretKey } }
}

/** The key pair a request is signed with, or a throw naming what is missing. */
export function signingKeys(credentials: Credentials): { accessKey: string; secretKey: string } {
  const accessKey = credentials.accessToken
  const secretKey = credentials.extra?.['secretKey']
  if (!accessKey || typeof secretKey !== 'string' || secretKey === '') {
    throw Object.assign(
      new Error(
        'Trolley connection has no secret key: every Trolley request is HMAC-signed with the access key and secret key. Reconnect with both.',
      ),
      { statusCode: 401, code: 'CREDENTIALS_INCOMPLETE' },
    )
  }
  return { accessKey, secretKey }
}
