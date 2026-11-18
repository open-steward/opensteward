import type { Credentials } from '../../adapter/interface'
import { ITHINK_DASHBOARD_URL } from './constants'

export function buildAuthUrl(_state: string): string {
  return ITHINK_DASHBOARD_URL
}

/**
 * Every v3 request carries two secrets inside its `data` envelope
 * (https://docs.ithinklogistics.com/doc-get-warehouse/3): "access_token String
 * You will get this from IThink Logistics team." and "secret_key String You
 * will get this from IThink Logistics team." The access token is stored as
 * `accessToken`, the secret key on `extra.secretKey`.
 */
export async function exchangeApiCredentials(
  accessToken: string,
  secretKey: string,
): Promise<Credentials> {
  return { accessToken, extra: { secretKey } }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
