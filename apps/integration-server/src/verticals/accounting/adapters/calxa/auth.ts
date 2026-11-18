/**
 * Calxa auth helpers — API-key model.
 *
 * Calxa uses a static API key that users obtain from their account settings.
 * There is no OAuth flow: the key is supplied once and stored as `accessToken`.
 * `buildAuthUrl` returns the settings page URL so the Connect wizard can direct
 * the user to retrieve their key.
 */

import type { Credentials } from '../../adapter/interface'

/** Directs the user to the Calxa settings page to retrieve their API key. */
export function buildAuthUrl(_state: string): string {
  return 'https://app.calxa.com/settings/api'
}

/**
 * For API-key adapters, `code` carries the raw key entered by the user.
 * Store it as `accessToken` so the client can pass it in `X-Api-Key`.
 */
export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: code }
}

/** API keys do not expire; return the existing credentials unchanged. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
