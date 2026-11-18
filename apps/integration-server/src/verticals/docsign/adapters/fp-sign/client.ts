/**
 * FP Sign REST API client.
 *
 * Auth is `Authorization: Bearer <token>` plus a `Tenant: <tenantId>` header
 * (read from `credentials.extra.tenant`). Lists follow FP Sign's two-step
 * id-fan-out model: a list endpoint returns an array of integer ids, then a
 * detail endpoint takes a comma-joined id list. Retries 429 + 5xx with
 * exponential backoff.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, MAX_PAGE_SIZE } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if (
        (status === 429 || (status !== undefined && status >= 500 && status < 600)) &&
        i < retries
      ) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class FpSignClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const tenant = String(credentials.extra?.['tenant'] ?? '')
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Tenant: tenant,
        Accept: 'application/json',
      },
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

  async tryGet<T>(path: string, params?: Record<string, unknown>): Promise<T | undefined> {
    try {
      return await this.get<T>(path, params)
    } catch (err) {
      const axiosErr = err as AxiosError
      if (axiosErr.response?.status === 404) return undefined
      throw err
    }
  }

  /**
   * Fetch an FP Sign id-list endpoint. These endpoints take no paging
   * parameter and return every id in the collection.
   */
  async ids(listPath: string, params?: Record<string, unknown>): Promise<string[]> {
    const ids = await this.get<Array<number | string>>(listPath, params)
    return Array.isArray(ids) ? ids.map((id) => String(id)) : []
  }

  /**
   * Hydrate ids through a detail endpoint that takes a comma-joined id list,
   * at most `MAX_PAGE_SIZE` ids per request so a large page does not build
   * one giant URL.
   */
  async hydrate<T>(ids: readonly string[], detailPath: (ids: string) => string): Promise<T[]> {
    const out: T[] = []
    for (let i = 0; i < ids.length; i += MAX_PAGE_SIZE) {
      const batch = await this.get<T[]>(detailPath(ids.slice(i, i + MAX_PAGE_SIZE).join(',')))
      if (Array.isArray(batch)) out.push(...batch)
    }
    return out
  }
}
