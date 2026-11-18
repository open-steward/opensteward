/**
 * OTOBO authentication — api_key model.
 *
 * OTOBO's Generic Interface authenticates via UserLogin + Password passed in
 * every request body (POST/PUT) or as query parameters (GET). We store these
 * two values plus the server URL and optional webservice name as the tenant's
 * credential set. At runtime the client injects them per-request.
 *
 * We encode the three required fields as:
 *   accessToken  = UserLogin
 *   extra.password = Password
 *   extra.serverUrl  = https://your-otobo.example.com  (no trailing slash)
 *   extra.websvcName = GenericTicketConnectorREST  (defaults if omitted)
 */
import type { Credentials, CredentialField } from '@opensteward/shared'
import { DEFAULT_WEBSERVICE_NAME } from './constants'

export function getAuthUrlUnsupported(): never {
  throw new Error('otobo uses UserLogin/Password auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'serverUrl',
      label: 'Server URL',
      type: 'text',
      required: true,
    },
    {
      name: 'userLogin',
      label: 'User Login',
      type: 'text',
      required: true,
    },
    {
      name: 'password',
      label: 'Password',
      type: 'password',
      required: true,
    },
    {
      name: 'websvcName',
      label: 'Webservice Name',
      type: 'text',
      required: false,
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const serverUrl = fields['serverUrl']?.replace(/\/+$/, '')
  const userLogin = fields['userLogin']
  const password = fields['password']
  const websvcName = fields['websvcName'] || DEFAULT_WEBSERVICE_NAME

  if (!serverUrl) throw new Error('otobo credentialFields require serverUrl')
  if (!userLogin) throw new Error('otobo credentialFields require userLogin')
  if (!password) throw new Error('otobo credentialFields require password')

  return {
    accessToken: userLogin,
    extra: {
      password,
      serverUrl,
      websvcName,
    },
  }
}
