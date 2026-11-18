import { customForm, type CredentialFormHelper } from '@opensteward/shared'
import type { Credentials } from '../../adapter/interface'
import { ABRAFLEXI_SETTINGS_URL } from './constants'

// AbraFlexi REST API uses HTTP Basic Authentication (username + password +
// instance URL). There is no OAuth flow — credentials are configured per
// self-hosted installation. The Connect Link page renders these fields
// directly via the shared `customForm` helper.

export function buildAuthUrl(_state: string): string {
  // Direct the user to their AbraFlexi installation settings page
  return ABRAFLEXI_SETTINGS_URL
}

export async function exchangeCode(code: string): Promise<Credentials> {
  // Accepts a colon-separated username:password string, as POSTed by
  // manual configuration tools, and splits it into credentials.
  const idx = code.indexOf(':')
  const username = idx !== -1 ? code.slice(0, idx) : code
  const password = idx !== -1 ? code.slice(idx + 1) : ''
  return { accessToken: username, extra: { password } }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Basic Auth credentials do not expire; return unchanged
  return credentials
}

export const credentialForm: CredentialFormHelper = customForm({
  fields: [
    {
      name: 'instanceUrl',
      label: 'AbraFlexi instance URL',
      type: 'url',
      placeholder: 'https://demo.abraflexi.eu/c/demo',
      helpText: 'Base URL of your self-hosted AbraFlexi installation, including the company segment.',
      required: true,
    },
    { name: 'username', label: 'Username', type: 'text', required: true },
    { name: 'password', label: 'Password', type: 'password', required: true },
  ],
  exchange: async (fields) => {
    const instanceUrl = (fields['instanceUrl'] ?? '').trim()
    const username = (fields['username'] ?? '').trim()
    const password = fields['password'] ?? ''
    if (!instanceUrl || !username || !password) {
      throw new Error('instanceUrl, username, and password are required.')
    }
    return { accessToken: username, extra: { password, instanceUrl } }
  },
})
