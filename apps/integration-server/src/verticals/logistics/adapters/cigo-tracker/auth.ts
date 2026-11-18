import type { Credentials } from '../../adapter/interface'
import { CIGO_DASHBOARD_URL } from './constants'

export function buildAuthUrl(_state: string): string {
  return CIGO_DASHBOARD_URL
}

export async function exchangeApiCredentials(
  accountId: string,
  authKey: string,
): Promise<Credentials> {
  return {
    accessToken: authKey,
    extra: { accountId },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
