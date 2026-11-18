/**
 * Acctivate Inventory Software — credential fields.
 *
 * Acctivate has no pull API ("Acctivate does not provide a "Web Services
 * API"", https://docs.acctivate.com/docs/ConfigurationWebStore.html), so no
 * adapter method reads these values: every list method refuses with 501.
 * The fields are kept unchanged so existing connections need not reconnect;
 * dropping them (or retiring the adapter) is left to the lead.
 *
 * Stored as:
 *   accessToken       = password
 *   extra.username    = username
 *   extra.serviceUrl  = the URL the customer entered
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error(
    'acctivate uses Username + Password + service URL; use credentialFields() instead',
  )
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'serviceUrl',
      label: 'Web-Service URL',
      type: 'text',
      required: true,
    },
    {
      name: 'username',
      label: 'Username',
      type: 'text',
      required: true,
    },
    {
      name: 'password',
      label: 'Password',
      type: 'password',
      required: true,
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const { serviceUrl, username, password } = fields
  if (!serviceUrl) throw new Error('acctivate credentialFields require serviceUrl')
  if (!username) throw new Error('acctivate credentialFields require username')
  if (!password) throw new Error('acctivate credentialFields require password')
  return {
    accessToken: password,
    extra: { username, serviceUrl },
  }
}
