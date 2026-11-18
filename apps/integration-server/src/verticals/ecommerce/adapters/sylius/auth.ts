/**
 * Sylius auth helpers.
 *
 * Sylius's API-Platform admin API authenticates an administrator by email and
 * password and returns a JWT:
 *
 *   POST {store}/api/v2/admin/administrators/token   (Sylius 1.13+ / 2.x)
 *   POST {store}/api/v2/admin/authentication-token   (Sylius 1.9 – 1.12)
 *   { "email": "...", "password": "..." }  →  { "token": "<jwt>" }
 *
 * Core Sylius has no OAuth2 authorization-code flow. The store URL and the
 * administrator login are collected on the Connect Link credential form; the
 * URL is the customer's and receives the password, so it is normalised to an
 * https origin and checked against private address space before every login.
 * The JWT is short-lived, so refresh logs in again with the stored login.
 *
 * Docs: https://docs.sylius.com/getting-started-with-sylius/using-api
 */

import axios, { type AxiosError } from 'axios'
import type { CredentialField, Credentials } from '@opensteward/shared'
import { assertPublicHost } from '@opensteward/shared'
import { TOKEN_LIFETIME_MS } from './constants'

/** Current token path first; the pre-1.13 path only when the current one is absent. */
const TOKEN_PATHS = ['/api/v2/admin/administrators/token', '/api/v2/admin/authentication-token']

/**
 * Reduce whatever the customer typed to the store origin: `shop.example.com`,
 * `https://Shop.Example.com/`, and a pasted admin URL all become
 * `https://shop.example.com`. Rejects blanks, non-URLs, and anything but https.
 */
export function normaliseStoreUrl(raw: string | undefined | null): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) throw new Error('Sylius store URL is required (e.g. https://shop.example.com).')
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new Error('Sylius store URL is not a valid URL.')
  }
  if (url.protocol !== 'https:') throw new Error('Sylius store URL must use https://.')
  if (!url.hostname) throw new Error('Sylius store URL is not a valid URL.')
  return url.origin
}

export const CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'baseUrl',
    label: 'Sylius store URL',
    type: 'url',
    required: true,
    placeholder: 'https://shop.example.com',
    helpText: 'The address your Sylius store is served from.',
  },
  {
    name: 'email',
    label: 'Administrator email',
    type: 'email',
    required: true,
    helpText: 'An administrator account with API access — ideally one dedicated to this integration.',
  },
  { name: 'password', label: 'Administrator password', type: 'password', required: true },
]

/** Log in on the store and return a JWT bearer token. `baseUrl` must already be normalised. */
export async function login(baseUrl: string, email: string, password: string): Promise<Credentials> {
  // The login request carries the password: never to a private address.
  await assertPublicHost(new URL(baseUrl).hostname.replace(/^\[|\]$/g, ''))
  let token: string | undefined
  for (const [i, path] of TOKEN_PATHS.entries()) {
    try {
      const { data } = await axios.post<{ token?: string }>(
        `${baseUrl}${path}`,
        { email, password },
        {
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          timeout: 30_000,
        },
      )
      token = data?.token
      break
    } catch (err) {
      const status = (err as AxiosError).response?.status
      if (status === 404 && i < TOKEN_PATHS.length - 1) continue
      throw err
    }
  }
  if (!token) throw new Error('Sylius did not return an administrator token.')
  return {
    accessToken: token,
    expiresAt: new Date(Date.now() + TOKEN_LIFETIME_MS),
    extra: { baseUrl, email, password },
  }
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const baseUrl = normaliseStoreUrl(fields?.['baseUrl'])
  const email = (fields?.['email'] ?? '').trim()
  const password = fields?.['password'] ?? ''
  if (!email || !password) {
    throw new Error('Sylius administrator email and password are required.')
  }
  return login(baseUrl, email, password)
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const baseUrl = credentials.extra?.['baseUrl'] as string | undefined
  const email = credentials.extra?.['email'] as string | undefined
  const password = credentials.extra?.['password'] as string | undefined

  if (!baseUrl) {
    throw new Error('Sylius refreshCredentials requires baseUrl in credentials.extra')
  }

  // A static bearer token (no stored login) has nothing to refresh with.
  if (!email || !password) return credentials

  const fresh = await login(normaliseStoreUrl(baseUrl), email, password)
  return { ...credentials, ...fresh, extra: { ...credentials.extra, ...fresh.extra } }
}
