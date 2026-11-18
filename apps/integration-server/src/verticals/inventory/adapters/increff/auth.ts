/**
 * Increff auth — access-key + secret-key pair provisioned by Increff.
 *
 * The client code is also required to construct the per-tenant base URL.
 * Credentials are stored as: accessToken = accessKey, extra.secretKey,
 * extra.clientCode.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('increff uses access-key + secret-key; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'clientCode', label: 'Client Code', type: 'text', required: true },
    { name: 'accessKey', label: 'Access Key', type: 'password', required: true },
    { name: 'secretKey', label: 'Secret Key', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const clientCode = fields['clientCode']
  const accessKey = fields['accessKey']
  const secretKey = fields['secretKey']
  if (!clientCode) throw new Error('increff credentialFields require clientCode')
  if (!accessKey) throw new Error('increff credentialFields require accessKey')
  if (!secretKey) throw new Error('increff credentialFields require secretKey')
  return { accessToken: accessKey, extra: { secretKey, clientCode } }
}
