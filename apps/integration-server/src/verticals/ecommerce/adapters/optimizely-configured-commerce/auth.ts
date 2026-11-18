/**
 * Optimizely Configured Commerce auth — OAuth2 resource-owner password
 * grant against the customer's own instance.
 *
 * `POST {instance}/identity/connect/token`, HTTP Basic client auth with the
 * documented public storefront client id/secret (`isc` / see
 * `./constants.ts`), and body `grant_type=password&username=…&password=…
 * &scope=iscapi` using the customer's own API user credentials. The docs
 * give no refresh token, so `username`/`password` are retained in
 * `credentials.extra` and `refreshCredentials` re-runs the same grant.
 *
 * Docs: https://docs.developers.optimizely.com/configured-commerce/reference/getting-started-with-the-b2b-commerce-rest-apis
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import {
  FALLBACK_TOKEN_LIFETIME_SECONDS,
  IDENTITY_TOKEN_PATH,
  STOREFRONT_CLIENT_ID,
  STOREFRONT_CLIENT_SECRET,
  STOREFRONT_SCOPE,
  TOKEN_REFRESH_SKEW_SECONDS,
} from './constants'

export function tokenUrl(instance: string): string {
  return `${instance.replace(/\/$/, '')}${IDENTITY_TOKEN_PATH}`
}

interface OptimizelyTokenResponse {
  access_token: string
  expires_in?: number
  token_type?: string
}

export async function fetchToken(
  instance: string,
  username: string,
  password: string,
): Promise<{ accessToken: string; expiresAt: Date }> {
  const basicAuth = Buffer.from(`${STOREFRONT_CLIENT_ID}:${STOREFRONT_CLIENT_SECRET}`).toString(
    'base64',
  )
  const body = new URLSearchParams({
    grant_type: 'password',
    username,
    password,
    scope: STOREFRONT_SCOPE,
  })
  const res = await axios.post<OptimizelyTokenResponse>(tokenUrl(instance), body.toString(), {
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    timeout: 30_000,
  })
  if (!res.data.access_token) {
    throw new Error('Optimizely token endpoint returned an empty access_token')
  }
  const lifetime = res.data.expires_in ?? FALLBACK_TOKEN_LIFETIME_SECONDS
  const safeLifetime = Math.max(lifetime - TOKEN_REFRESH_SKEW_SECONDS, 0)
  return {
    accessToken: res.data.access_token,
    expiresAt: new Date(Date.now() + safeLifetime * 1000),
  }
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'Optimizely Configured Commerce uses a resource-owner password grant — there is no ' +
      'authorization-code exchange. POST credentials to /v1/connections with body ' +
      '`{platform: "optimizely-configured-commerce", credentials: {instance, username, password}}`.',
  )
}

/**
 * No browser-redirect flow exists — the Connect page collects credentials
 * directly (see `./connect-form.ts`). Point the operator at the reference
 * docs describing the grant.
 */
export function buildInfoUrl(): string {
  return 'https://docs.developers.optimizely.com/configured-commerce/reference/getting-started-with-the-b2b-commerce-rest-apis'
}

/** Re-run the password grant using the username/password stashed at connect time. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const instance = credentials.extra?.['instance'] as string | undefined
  const username = credentials.extra?.['username'] as string | undefined
  const password = credentials.extra?.['password'] as string | undefined
  if (!instance || !username || !password) {
    throw new Error(
      'Optimizely refreshCredentials requires instance, username, and password in ' +
        'credentials.extra — re-create the connection with the required fields.',
    )
  }
  const { accessToken, expiresAt } = await fetchToken(instance, username, password)
  return { ...credentials, accessToken, expiresAt }
}
