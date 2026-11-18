/**
 * commercetools OAuth2 helpers — client_credentials grant (server-to-server).
 *
 * Unlike Shopify/WooCommerce, commercetools does not use an authorization
 * code flow for back-office adapters. The caller configures an API Client
 * in the Merchant Center and supplies `{projectKey, clientId, clientSecret,
 * region, scopes}` directly; the adapter then exchanges that for a Bearer
 * token against `https://auth.{region}.commercetools.com/oauth/token`.
 *
 * Tokens live ~48h (`expires_in: 172800`) and do NOT carry a refresh_token;
 * `refreshCredentials` re-runs the same client_credentials request.
 *
 * Docs: https://docs.commercetools.com/api/authorization#client-credentials-flow
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_REGION, REGIONS, TOKEN_BUFFER_MS } from './constants'

interface CommerceToolsTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  scope?: string
}

export interface CommerceToolsAuthInput {
  projectKey: string
  clientId: string
  clientSecret: string
  region?: string
  scopes?: string[]
}

/** Resolve a regional auth host or throw a descriptive error. */
export function resolveAuthHost(region: string | undefined): string {
  const slug = region ?? DEFAULT_REGION
  const entry = REGIONS[slug]
  if (!entry) {
    throw new Error(
      `commercetools: unknown region '${slug}'. Supported regions: ${Object.keys(REGIONS).join(', ')}`,
    )
  }
  return entry.authHost
}

/**
 * Exchange a client_credentials grant for a Bearer token. The resulting
 * Credentials embed projectKey/clientId/clientSecret/region/scopes under
 * `extra` so `refreshCredentials` can re-authenticate without fresh input.
 */
export async function requestToken(input: CommerceToolsAuthInput): Promise<Credentials> {
  const { projectKey, clientId, clientSecret, region, scopes } = input
  const authHost = resolveAuthHost(region)

  const params = new URLSearchParams()
  params.set('grant_type', 'client_credentials')
  if (scopes && scopes.length > 0) {
    params.set('scope', scopes.join(' '))
  }
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const { data } = await axios.post<CommerceToolsTokenResponse>(
    `https://${authHost}/oauth/token`,
    params.toString(),
    {
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )

  const expiresAt = new Date(Date.now() + data.expires_in * 1000 - TOKEN_BUFFER_MS)
  return {
    accessToken: data.access_token,
    expiresAt,
    scope: data.scope,
    extra: {
      projectKey,
      clientId,
      clientSecret,
      region: region ?? DEFAULT_REGION,
      scopes: scopes ?? [],
    },
  }
}
