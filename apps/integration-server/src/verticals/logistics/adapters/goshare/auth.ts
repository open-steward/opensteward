import type { Credentials } from '../../adapter/interface'
import { simpleApiKey } from '@opensteward/shared'
import { GOSHARE_DASHBOARD_URL } from './constants'

export const GOSHARE_FORM = simpleApiKey({
  label: 'API Key',
  placeholder: 'gs_live_...',
  helpText: `Find your API key in the GoShare dashboard at ${GOSHARE_DASHBOARD_URL}`,
})

export function buildAuthUrl(_state: string): string {
  return GOSHARE_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  return { accessToken: apiKey }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
