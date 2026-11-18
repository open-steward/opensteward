/**
 * Take Blip auth — static API Key model.
 *
 * Users obtain their API key ("Authorization Key") from the Blip Portal
 * under Settings > Connection Information. The contract ID is also required
 * to build the per-tenant base URL.
 *
 * Header format: Authorization: Key {apiKey}
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('take-blip uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'contractId', label: 'Contract ID', type: 'text', required: true },
    { name: 'apiKey', label: 'API Key', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  const contractId = fields['contractId']
  if (!apiKey) throw new Error('take-blip credentialFields require apiKey')
  if (!contractId) throw new Error('take-blip credentialFields require contractId')
  return { accessToken: apiKey, extra: { contractId } }
}
