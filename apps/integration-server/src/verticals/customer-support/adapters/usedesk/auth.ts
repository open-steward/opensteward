/**
 * UseDesk authentication — static api_token model.
 *
 * The api_token is obtained from Channels → Add Channel → API in the UseDesk
 * admin panel. It must be passed in the body of every POST request as
 * `api_token`. Tokens do not expire and there is no OAuth flow.
 *
 * For self-hosted UseDesk instances the base URL differs from the cloud URL;
 * it is stored in credentials.extra.baseUrl when provided.
 *
 * Docs: https://api.usedocs.com/article/51373
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('usedesk uses static API token auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiToken',
      label: 'API Token',
      type: 'password',
      required: true,
      helpText:
        'Found in your UseDesk admin panel under Channels → Add Channel → API. ' +
        'Use the "secret key" shown after channel creation.',
    },
    {
      name: 'baseUrl',
      label: 'API Base URL (self-hosted only)',
      type: 'text',
      required: false,
      helpText:
        'Leave blank for the UseDesk cloud (https://secure.usedesk.com/uapi). ' +
        'Override only if you run a self-hosted UseDesk instance.',
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiToken = fields['apiToken']
  if (!apiToken) throw new Error('usedesk credentialFields require apiToken')
  const extra: Record<string, string> = {}
  if (fields['baseUrl']) extra['baseUrl'] = fields['baseUrl']
  return { accessToken: apiToken, extra }
}
