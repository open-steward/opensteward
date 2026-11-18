/**
 * Octadesk authentication.
 *
 * Octadesk uses static API key auth. The API token is a 73-character string
 * generated in the Octadesk admin UI under Settings > Integrations > API.
 * It is sent as a Bearer token in the Authorization header, and the
 * agent's email is required in the octa-agent-email header.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('octadesk uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiToken',
      label: 'API Token',
      type: 'password',
      required: true,
      helpText: 'Your Octadesk API token (73 characters), generated in Settings > Integrations > API.',
    },
    {
      name: 'agentEmail',
      label: 'Agent Email',
      type: 'text',
      required: true,
      helpText: 'The email address of the Octadesk agent/admin used to generate the API token.',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiToken = fields['apiToken']
  const agentEmail = fields['agentEmail']
  if (!apiToken) throw new Error('octadesk credentialFields require apiToken')
  if (!agentEmail) throw new Error('octadesk credentialFields require agentEmail')
  return {
    accessToken: apiToken,
    extra: { agentEmail },
  }
}
