/**
 * Icertis Contract Intelligence (ICI) REST API client.
 *
 * ICI uses Bearer-JWT auth (Microsoft Entra ID) plus a per-tenant
 * subscription key delivered in the `ici-product-key` header. The gateway
 * host is per-tenant and resolved from `credentials.extra.instanceUrl`; all
 * resource paths nest under `${instanceUrl}${API_PATH_PREFIX}`. There is no
 * default gateway: a connection without one is refused rather than sending
 * its token to a shared non-production host.
 *
 * Lists are page/pageSize paginated (1-based, pageSize capped at 100); the
 * server returns `TotalRowCount` / `TotalNumberOfPages` / `hasMoreData` in
 * the response envelope.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { connectionIcertisGateway } from './auth'
import { API_PATH_PREFIX, PRODUCT_KEY_HEADER } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if ((status === 429 || (status !== undefined && status >= 500 && status < 600)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class IcertisClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, fallbackInstanceUrl?: string, fallbackProductKey?: string) {
    const instanceUrl = connectionIcertisGateway(credentials, fallbackInstanceUrl)
    const storedKey = credentials.extra?.['productKey']
    const productKey = typeof storedKey === 'string' && storedKey ? storedKey : (fallbackProductKey ?? '')
    const headers: Record<string, string> = {
      Authorization: `Bearer ${credentials.accessToken}`,
      Accept: 'application/json',
    }
    if (productKey) headers[PRODUCT_KEY_HEADER] = productKey
    this.http = axios.create({
      baseURL: `${instanceUrl}${API_PATH_PREFIX}`,
      headers,
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }

  async put<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }
}
