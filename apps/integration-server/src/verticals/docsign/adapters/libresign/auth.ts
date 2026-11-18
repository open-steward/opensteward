/**
 * LibreSign credential handling.
 *
 * LibreSign has no OAuth flow of its own — it rides on Nextcloud auth. The
 * supported machine credential is a Nextcloud **app password** scoped to the
 * connecting user, used as HTTP Basic together with the username. We model
 * this as the `api_key` auth type via a custom Connect Link form that also
 * collects the customer's self-hosted Nextcloud server URL.
 *
 * The form yields:
 *   credentials.accessToken      = the app password (the "API key")
 *   credentials.extra.serverUrl  = the Nextcloud base URL
 *   credentials.extra.username   = the Nextcloud login name
 *
 * Docs: https://libresign.github.io/Getting-started
 */

import { customForm } from '@opensteward/shared'
import type { CredentialFormHelper } from '@opensteward/shared'

/** Strip a trailing slash so path joins stay clean. */
function normalizeServerUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '')
}

/**
 * Connect Link form for LibreSign. Three fields — server URL, username, and
 * the app password (treated as the API key). The exchange validates presence
 * and stows the non-secret context on `credentials.extra`.
 */
export const LIBRESIGN_CREDENTIAL_FORM: CredentialFormHelper = customForm({
  fields: [
    {
      name: 'serverUrl',
      label: 'Nextcloud server URL',
      type: 'text',
      placeholder: 'https://cloud.example.com',
      helpText: 'The base URL of the Nextcloud instance running LibreSign.',
      required: true,
    },
    {
      name: 'username',
      label: 'Nextcloud username',
      type: 'text',
      helpText: 'The login name the app password belongs to.',
      required: true,
    },
    {
      name: 'apiKey',
      label: 'App password',
      type: 'password',
      helpText:
        'Create one under Nextcloud → Settings → Security → "Devices & sessions".',
      required: true,
    },
  ],
  async exchange(input) {
    const serverUrl = normalizeServerUrl(input?.['serverUrl'] ?? '')
    const username = (input?.['username'] ?? '').trim()
    const apiKey = (input?.['apiKey'] ?? '').trim()
    if (!serverUrl) throw new Error('Nextcloud server URL is required.')
    if (!username) throw new Error('Nextcloud username is required.')
    if (!apiKey) throw new Error('App password is required.')
    return {
      accessToken: apiKey,
      extra: { serverUrl, username },
    }
  },
})
