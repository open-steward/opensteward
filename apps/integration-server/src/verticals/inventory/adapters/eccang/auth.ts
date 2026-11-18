/**
 * ECCANG auth — api_key flow.
 *
 * Credentials required:
 *   appKey      — the application key issued by the ECCANG open platform
 *   token       — user/tenant access token (obtained via the platform OAuth flow
 *                 or a long-lived personal token from the developer console)
 *   subjectCode — tenant identifier (warehouse/company code in the platform)
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('eccang uses static API key credentials; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'appKey', label: 'App Key', type: 'password', required: true },
    { name: 'token', label: 'Access Token', type: 'password', required: true },
    { name: 'subjectCode', label: 'Tenant / Subject Code', type: 'text', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const appKey = fields['appKey']
  const token = fields['token']
  const subjectCode = fields['subjectCode']
  if (!appKey || !token || !subjectCode) {
    throw new Error('eccang credentialFields require appKey, token, and subjectCode')
  }
  return { accessToken: appKey, extra: { token, subjectCode } }
}
