/**
 * ProProfs Help Desk authentication.
 *
 * Uses a static API-key model: the caller provides their registered account
 * email + a secret token (both obtainable from "My Account" in the dashboard).
 * Credentials are passed in every POST request body — there is no bearer token
 * or HTTP Authorization header.
 *
 * We store `account_email` in `extra.accountEmail` and the API token as
 * `accessToken` so the client can inject both into each request body.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('proprofs-help-desk uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'accountEmail', label: 'Account Email', type: 'text',     required: true },
    { name: 'apiToken',     label: 'API Token',     type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const accountEmail = fields['accountEmail']
  const apiToken     = fields['apiToken']
  if (!accountEmail) throw new Error('proprofs-help-desk requires accountEmail')
  if (!apiToken)     throw new Error('proprofs-help-desk requires apiToken')
  return {
    accessToken: apiToken,
    extra: { accountEmail },
  }
}
