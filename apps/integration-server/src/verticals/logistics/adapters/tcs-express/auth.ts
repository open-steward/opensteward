import type { Credentials } from '../../adapter/interface'
import { TCS_EXPRESS_DASHBOARD_URL } from './constants'

/**
 * TCS Express uses a simple API key authentication scheme.
 * The key is passed via the X-API-Key request header.
 *
 * buildAuthUrl:        Returns the TCS Express portal where users obtain their API key.
 * exchangeApiKey:      Stores the raw API key as the access token.
 * refreshCredentials:  Keys do not expire; returns credentials unchanged.
 */

export function buildAuthUrl(_state: string): string {
  return TCS_EXPRESS_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  return { accessToken: apiKey }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
