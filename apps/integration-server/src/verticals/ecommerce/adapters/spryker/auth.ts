/**
 * Spryker Glue API OAuth2 helpers (Storefront API / customer credentials flow).
 *
 * Spryker's Storefront Glue API uses a resource-owner password credentials
 * (ROPC) OAuth2 flow. Callers POST a JSON:API document to `POST /access-tokens`
 * and receive a short-lived access token (default 8 hours / 28 800 s) plus a
 * long-lived refresh token (default 30 days / 2 628 000 s).
 *
 * Authorization header: `Authorization: Bearer <access_token>`
 *
 * Base URL pattern: https://glue.{storeDomain}  (configurable per instance)
 *
 * Docs:
 *   https://docs.spryker.com/docs/pbc/all/identity-access-management/latest/
 *     manage-using-glue-api/glue-api-manage-customer-authentication-tokens-via-oauth-2.0
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { TOKEN_PATH, REFRESH_TOKEN_PATH } from './constants'

// ── Raw response shapes ───────────────────────────────────────────────────────

interface SprykerTokenAttributes {
  tokenType: string
  expiresIn: number
  accessToken: string
  refreshToken: string
}

interface SprykerTokenResponse {
  data: {
    type: string
    attributes: SprykerTokenAttributes
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toCredentials(attrs: SprykerTokenAttributes): Credentials {
  const now = Date.now()
  return {
    accessToken: attrs.accessToken,
    refreshToken: attrs.refreshToken,
    // expiresIn is in seconds; store as absolute Date
    expiresAt: attrs.expiresIn > 0 ? new Date(now + attrs.expiresIn * 1_000) : undefined,
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Authenticate a customer (resource-owner password credentials) and return
 * canonical Credentials.
 *
 * @param glueBaseUrl - e.g. "https://glue.mysprykershop.com"
 * @param username    - Customer e-mail address
 * @param password    - Customer password
 */
export async function authenticateCustomer(
  glueBaseUrl: string,
  username: string,
  password: string,
): Promise<Credentials> {
  const url = `${glueBaseUrl.replace(/\/$/, '')}/${TOKEN_PATH}`
  const { data } = await axios.post<SprykerTokenResponse>(
    url,
    {
      data: {
        type: 'access-tokens',
        attributes: { username, password },
      },
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    },
  )
  return toCredentials(data.data.attributes)
}

/**
 * Exchange a refresh token for new credentials.
 *
 * @param glueBaseUrl  - e.g. "https://glue.mysprykershop.com"
 * @param refreshToken - Refresh token from a previous authentication
 */
export async function doRefreshCredentials(
  glueBaseUrl: string,
  refreshToken: string,
): Promise<Credentials> {
  const url = `${glueBaseUrl.replace(/\/$/, '')}/${REFRESH_TOKEN_PATH}`
  const { data } = await axios.post<SprykerTokenResponse>(
    url,
    {
      data: {
        type: 'refresh-tokens',
        attributes: { refreshToken },
      },
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    },
  )
  return toCredentials(data.data.attributes)
}
