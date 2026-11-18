/**
 * Billit authentication helpers — API key (PartyID + Key) model.
 *
 * Billit authenticates via two request headers:
 *   apikey:   {MyApiKey}   — found in the user's MyBillit profile
 *   partyID:  {MyPartyID}  — the company/party identifier in Billit
 *
 * The access token stored in Credentials.accessToken carries the raw API key.
 * The PartyID is stored in Credentials.tenantId.
 *
 * Docs: https://docs.billit.be/docs/partyid-and-key
 */

import type { Credentials } from '../../adapter/interface'
import type { CredentialField } from '@opensteward/shared'

export const BILLIT_CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'apiKey',
    label: 'API key',
    type: 'password',
    placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    helpText: 'Found under My Profile in your MyBillit dashboard.',
    required: true,
  },
  {
    name: 'partyId',
    label: 'Party ID',
    type: 'text',
    placeholder: 'e.g. BE0123456789',
    helpText: 'The Party ID (company identifier) shown in your MyBillit account settings.',
    required: true,
  },
]

export async function exchangeBillitCredentials(
  fields: Record<string, string>,
): Promise<Credentials> {
  const apiKey = (fields['apiKey'] ?? '').trim()
  const partyId = (fields['partyId'] ?? '').trim()
  if (!apiKey) throw new Error('API key is required.')
  if (!partyId) throw new Error('Party ID is required.')
  return { accessToken: apiKey, tenantId: partyId }
}

// API keys do not expire — refreshCredentials is a pass-through.
export function refreshBillitCredentials(credentials: Credentials): Promise<Credentials> {
  return Promise.resolve(credentials)
}
