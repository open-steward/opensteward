import type { CredentialField, Credentials } from '@opensteward/shared'

/**
 * https://api-docs.solidgate.com/api/get-started: "The Solidgate API v1 uses
 * a signature-based authentication model. Each request must carry two headers
 * that are computed from your Public and Secret key pair." and "Public keys use
 * the prefix api_pk_, secret keys use the prefix api_sk_."
 *
 * The Public key is kept in `accessToken` (it is the `merchant` header), the
 * Secret key in `extra.secretKey` (it only signs, and is never sent).
 */
export const SOLIDGATE_CREDENTIAL_FIELDS: CredentialField[] = [
  { name: 'apiKey', label: 'Public key (api_pk_…)', type: 'password', required: true },
  { name: 'secretKey', label: 'Secret key (api_sk_…)', type: 'password', required: true },
]

export function buildCredentials(fields: Record<string, string>): Credentials {
  const publicKey = (fields.apiKey ?? '').trim()
  const secretKey = (fields.secretKey ?? '').trim()
  if (!publicKey || !secretKey) {
    throw new Error('Solidgate needs both the Public key and the Secret key to sign requests.')
  }
  return { accessToken: publicKey, extra: { secretKey } }
}
