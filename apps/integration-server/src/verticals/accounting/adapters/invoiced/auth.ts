/**
 * Invoiced auth — API key via HTTP Basic Auth.
 *
 * Invoiced uses a simple API key with no OAuth flow. The API key is passed as
 * the username in HTTP Basic Auth with an empty password.
 *
 * Docs: https://developer.invoiced.com/api#section/Authentication
 */
import type { Credentials } from '../../adapter/interface'
import { simpleApiKey } from '@opensteward/shared'

const FORM = simpleApiKey({
  label: 'API Key',
  placeholder: 'Your Invoiced API key',
  helpText: 'Find your API key under Settings → Developers in your Invoiced account.',
})

export const credentialFields = FORM.credentialFields
export const exchangeCredentials = FORM.exchangeCredentials

/** Invoiced API keys do not expire. Return as-is. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}

/**
 * Builds the Authorization header value for Invoiced.
 * The API key is the Basic-Auth username; password is empty.
 */
export function buildAuthHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`
}
