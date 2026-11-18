/**
 * Haptik authentication.
 *
 * Haptik uses a static Bearer token + client-id pair — there is no OAuth
 * flow. Credentials are provisioned by the Haptik SPOC.
 *
 * Required credential fields:
 *   - apiToken  — Bearer token (CLIENT_AUTH_TOKEN from Haptik admin panel)
 *   - clientId  — Account / client identifier for the 'client-id' header
 *   - baseUrl   — Tenant-specific base URL (provided by Haptik at integration time)
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('haptik uses static API token auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiToken',
      label: 'API Token',
      type: 'password',
      required: true,
      helpText: 'Your Haptik CLIENT_AUTH_TOKEN. Find it under Permission Management → Admin Tools → Partner List in the Haptik admin panel.',
    },
    {
      name: 'clientId',
      label: 'Client ID',
      type: 'text',
      required: true,
      helpText: 'Your Haptik Account ID (client-id). Found in the View Credentials section on the bot page.',
    },
    {
      name: 'baseUrl',
      label: 'Base URL',
      type: 'text',
      required: true,
      helpText: 'Your tenant-specific Haptik base URL (e.g. https://your-account.haptikapi.com). Provided by your Haptik SPOC.',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiToken = fields['apiToken']
  const clientId = fields['clientId']
  const baseUrl = fields['baseUrl']
  if (!apiToken) throw new Error('haptik credentialFields require apiToken')
  if (!clientId) throw new Error('haptik credentialFields require clientId')
  if (!baseUrl) throw new Error('haptik credentialFields require baseUrl')
  return {
    accessToken: apiToken,
    extra: { clientId, baseUrl: baseUrl.replace(/\/$/, '') },
  }
}
