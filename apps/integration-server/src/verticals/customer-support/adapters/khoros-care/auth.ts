/**
 * Khoros Care authentication.
 *
 * The Care API v2 uses HTTP Basic Authentication with a dedicated
 * API user account (username + password). Khoros recommends creating
 * a single distinct account per integration with only the required
 * API role (e.g. "Base API").
 *
 * There is no OAuth2 authorization-code flow for the Care API v2.
 * Credentials are static and are stored as Basic Auth credentials
 * encoded in accessToken as "username:password" base64.
 *
 * The API lives on the customer's own `{instance}.response.lithium.com`
 * host, so the instance is collected too and stored in credentials.extra.
 *
 * Docs: https://developer.khoros.com/khoroscaredevdocs/docs/http-authentication
 */
import type { Credentials, CredentialField } from '@opensteward/shared'
import { API_HOST_SUFFIX } from './constants'

const INSTANCE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/

/**
 * Reduce whatever the customer typed to the instance name: `acme`,
 * `acme.response.lithium.com`, `https://acme.response.lithium.com/api/v2` all
 * become `acme`. Rejects blanks and any host outside response.lithium.com,
 * since the Basic credentials are sent to it.
 */
export function normaliseInstance(raw: unknown): string {
  const value = (typeof raw === 'string' ? raw : '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[/?#:].*$/, '')
  if (!value) {
    throw new Error('Khoros Care instance is required (e.g. acme for acme.response.lithium.com).')
  }
  const suffix = `.${API_HOST_SUFFIX}`
  const name = value.endsWith(suffix) ? value.slice(0, -suffix.length) : value
  if (!INSTANCE.test(name)) {
    throw new Error(
      'Khoros Care instance must be the name from your {instance}.response.lithium.com address.',
    )
  }
  return name
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'instance',
      label: 'Instance',
      type: 'text',
      required: true,
      placeholder: 'acme',
      helpText: 'The name in your Khoros Care address — acme for acme.response.lithium.com.',
    },
    {
      name: 'username',
      label: 'API username',
      type: 'text',
      required: true,
      helpText: 'Username of the dedicated Khoros Care API user account.',
    },
    {
      name: 'password',
      label: 'API password',
      type: 'password',
      required: true,
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const instance = normaliseInstance(fields?.['instance'])
  const username = (fields?.['username'] ?? '').trim()
  const password = fields?.['password'] ?? ''
  if (!username || !password) {
    throw new Error('Khoros Care API username and password are required.')
  }

  // Encode Basic Auth token and store as accessToken for convenience.
  // The client will decode and send as Authorization: Basic <base64>
  const basicToken = Buffer.from(`${username}:${password}`).toString('base64')
  return {
    accessToken: basicToken,
    extra: { instance },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Basic Auth credentials don't expire; pass through unchanged.
  return credentials
}
