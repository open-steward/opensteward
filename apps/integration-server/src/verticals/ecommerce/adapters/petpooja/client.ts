/**
 * Petpooja Online Ordering API client.
 *
 * Features:
 *  - Auth credentials (appKey, accessToken, restaurantId, appSecretKey) are
 *    injected into every request body (POST) or as query parameters (GET).
 *    Petpooja does NOT use an Authorization header.
 *  - Simple retry with exponential backoff on 429 and 5xx.
 *  - `listWithOffset` helper for offset+limit pagination.
 *
 * All API responses wrap data in a top-level envelope:
 *   { status: 1, message: "...", <resource>: [...] }
 * Status 1 means success; any other value is treated as an error.
 *
 * Docs: https://onlineorderingapisv210.docs.apiary.io/
 */

import axios, { type AxiosError, type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { BASE_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      const retryable = status === 429 || (status != null && status >= 500 && status < 600)
      if (retryable && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export interface PetpoojaAuthParams {
  appKey: string
  accessToken: string
  restaurantId: string
  appSecretKey: string
}

export interface ListResult<T> {
  items: T[]
  /** Next offset, if more pages exist. */
  nextOffset?: number
}

/**
 * Extract auth params from canonical Credentials.
 * The `accessToken` field holds the Petpooja accessToken; the remaining
 * three credentials are stored in `credentials.extra`.
 */
export function extractAuthParams(credentials: Credentials): PetpoojaAuthParams {
  const accessToken = credentials.accessToken
  const appKey = credentials.extra?.['appKey'] as string | undefined
  const restaurantId = credentials.extra?.['restaurantId'] as string | undefined
  const appSecretKey = credentials.extra?.['appSecretKey'] as string | undefined

  if (!appKey || !restaurantId || !appSecretKey) {
    throw new Error(
      'PetpoojaClient: credentials.extra must contain appKey, restaurantId, and appSecretKey. ' +
        'Supply them via the credential form or POST to /v1/connections with ' +
        'credentials: { accessToken, extra: { appKey, restaurantId, appSecretKey } }.',
    )
  }
  return { appKey, accessToken, restaurantId, appSecretKey }
}

export class PetpoojaClient {
  private http: AxiosInstance
  private auth: PetpoojaAuthParams

  constructor(credentials: Credentials) {
    this.auth = extractAuthParams(credentials)
    this.http = axios.create({
      baseURL: BASE_URL,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /** Auth params injected into every POST body. */
  private authBody(): Record<string, string> {
    return {
      app_key: this.auth.appKey,
      access_token: this.auth.accessToken,
      restaurant_id: this.auth.restaurantId,
      app_secret_key: this.auth.appSecretKey,
    }
  }

  /** Auth params injected into every GET query string. */
  private authQuery(): Record<string, string> {
    return {
      app_key: this.auth.appKey,
      access_token: this.auth.accessToken,
      restaurant_id: this.auth.restaurantId,
      app_secret_key: this.auth.appSecretKey,
    }
  }

  /**
   * Validate the Petpooja response envelope.
   *
   * Every Petpooja response wraps data in:
   *   { status: 1, message: "...", <resource>: [...] }
   * A `status` value other than 1 signals an application-level error even
   * when the HTTP status code is 200. Throw immediately so callers never
   * silently receive a poisoned envelope.
   */
  private assertEnvelope(data: Record<string, unknown>, path: string): void {
    if (data['status'] !== 1) {
      const msg = typeof data['message'] === 'string' ? data['message'] : JSON.stringify(data)
      throw new Error(`Petpooja API error on ${path}: ${msg} (status=${data['status']})`)
    }
  }

  async get<T>(path: string, params: Record<string, unknown> = {}): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<Record<string, unknown>>(path, {
        params: { ...this.authQuery(), ...params },
      })
      this.assertEnvelope(data, path)
      return data as T
    })
  }

  async post<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<Record<string, unknown>>(path, {
        ...this.authBody(),
        ...body,
      })
      this.assertEnvelope(data, path)
      return data as T
    })
  }

  /**
   * Offset-based list helper.
   *
   * Petpooja list responses have the shape:
   *   { status: 1, message: "...", <resourceKey>: [...] }
   *
   * Pagination is offset+limit. If `items.length === limit`, there may be
   * more pages — the caller should increment offset by `limit` and fetch again.
   */
  async listWithOffset<T>(
    path: string,
    resourceKey: string,
    extraBody: Record<string, unknown> = {},
    limit?: number,
    offset?: number,
  ): Promise<ListResult<T>> {
    const pageSize = Math.min(limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const pageOffset = offset ?? 0

    const body: Record<string, unknown> = {
      ...extraBody,
      limit: pageSize,
      offset: pageOffset,
    }

    // post() already validates the envelope (status === 1).
    const res = await this.post<Record<string, unknown>>(path, body)
    const items = ((res[resourceKey] ?? res['data'] ?? []) as T[])

    // If we got a full page, assume there's more.
    const hasMore = items.length >= pageSize
    return {
      items,
      nextOffset: hasMore ? pageOffset + pageSize : undefined,
    }
  }
}
