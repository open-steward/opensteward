/**
 * Petpooja auth helpers.
 *
 * Petpooja does NOT use OAuth2 authorization-code flow. Credentials are four
 * partner-supplied tokens: appKey, accessToken, restaurantId, and
 * appSecretKey. They are issued by the Petpooja team upon partner onboarding
 * (contact support@petpooja.com).
 *
 * The adapter uses `customForm` from @opensteward/shared so the Connect Link
 * flow renders a multi-field credential form instead of an OAuth redirect.
 *
 * Docs: https://onlineorderingapisv210.docs.apiary.io/
 */

import type { Credentials } from '@opensteward/shared'
import { customForm } from '@opensteward/shared'

export const PETPOOJA_CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'appKey',
      label: 'App Key',
      type: 'text',
      required: true,
      helpText: 'The App Key issued by Petpooja for your integration.',
    },
    {
      name: 'accessToken',
      label: 'Access Token',
      type: 'password',
      required: true,
      helpText: 'The Access Token issued by Petpooja for your application.',
    },
    {
      name: 'restaurantId',
      label: 'Restaurant ID',
      type: 'text',
      required: true,
      helpText: 'Your restaurant identifier in the Petpooja system.',
    },
    {
      name: 'appSecretKey',
      label: 'App Secret Key',
      type: 'password',
      required: true,
      helpText: 'The App Secret Key issued by Petpooja for your integration.',
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const appKey = (fields['appKey'] ?? '').trim()
    const accessToken = (fields['accessToken'] ?? '').trim()
    const restaurantId = (fields['restaurantId'] ?? '').trim()
    const appSecretKey = (fields['appSecretKey'] ?? '').trim()

    if (!appKey) throw new Error('App Key is required.')
    if (!accessToken) throw new Error('Access Token is required.')
    if (!restaurantId) throw new Error('Restaurant ID is required.')
    if (!appSecretKey) throw new Error('App Secret Key is required.')

    return {
      // We store the accessToken in the canonical field and the remaining
      // three credentials under `extra` so the client can reconstruct the
      // full auth context on every request.
      accessToken,
      extra: { appKey, restaurantId, appSecretKey },
    }
  },
})

export function buildAuthUrl(): string {
  // Petpooja has no OAuth authorize URL — direct partners to the support page.
  return 'https://www.petpooja.com/poss/restaurant-integrations'
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'Petpooja does not use OAuth code exchange. ' +
      'Obtain credentials (appKey, accessToken, restaurantId, appSecretKey) from the Petpooja team ' +
      '(support@petpooja.com) and supply them via the credential form.',
  )
}
