import { customForm, type CredentialField } from '@opensteward/shared'
import type { Credentials } from '../../adapter/interface'
import { SAASU_SETTINGS_URL } from './constants'

// Saasu uses a Web Service Access Key (no OAuth2 flow).
// The "code" provided by the user IS the access key.
// Every call is scoped to a company file by its numeric File ID, which the
// Connect Link form collects per customer (credentials.extra.fileUid).

export function buildAuthUrl(_state: string): string {
  return SAASU_SETTINGS_URL
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return {
    accessToken: code,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Saasu web service keys do not expire — return as-is
  return credentials
}

// ── Connect Link form ────────────────────────────────────────────────────────

const FIELDS: CredentialField[] = [
  {
    name: 'fileUid',
    label: 'File ID',
    type: 'text',
    required: true,
    placeholder: '12345',
    helpText:
      'The numeric ID of the Saasu file to connect, shown on Settings → Web Services (secure.saasu.com) next to the access key.',
  },
  {
    name: 'apiKey',
    label: 'Web services access key',
    type: 'password',
    required: true,
    helpText: 'In Saasu: Settings → Web Services → enable web services access and copy the access key.',
  },
]

export const CREDENTIAL_FORM = customForm({
  fields: FIELDS,
  async exchange(input): Promise<Credentials> {
    const apiKey = (input['apiKey'] ?? '').trim()
    if (!apiKey) throw new Error('Web services access key is required.')
    const fileUid = (input['fileUid'] ?? '').trim()
    if (!fileUid) throw new Error('File ID is required.')
    if (!/^\d+$/.test(fileUid)) {
      throw new Error('File ID must be the numeric file identifier shown in Saasu, for example 12345.')
    }
    return { accessToken: apiKey, extra: { fileUid } }
  },
})
