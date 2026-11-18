import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { apiBaseUrl } from './auth'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const s = (err as AxiosError).response?.status
      if ((s === 429 || (s !== undefined && s >= 500)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/** One page of a Rebilly collection: the bare-array body and its total. */
export interface RebillyPage<R> {
  rows: R[]
  /** `Pagination-Total`: "Total number of items that match the request." */
  total: number | undefined
}

export class RebillyClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: apiBaseUrl(credentials),
      headers: {
        'REB-APIKEY': credentials.accessToken,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => (await this.http.get<T>(path, { params })).data)
  }

  /**
   * GET a collection. Every collection response is `type: array` and carries
   * the `Pagination-Total` header (components/headers/Pagination-Total.yaml).
   */
  async getPage<R>(path: string, params: Record<string, unknown>): Promise<RebillyPage<R>> {
    return withRetry(async () => {
      const res = await this.http.get<unknown>(path, { params })
      if (!Array.isArray(res.data)) {
        throw new Error(`Rebilly GET ${path}: expected a JSON array body`)
      }
      const header = (res.headers as Record<string, unknown> | undefined)?.['pagination-total']
      const total = header == null || header === '' ? undefined : Number(header)
      return {
        rows: res.data as R[],
        total: total !== undefined && Number.isInteger(total) && total >= 0 ? total : undefined,
      }
    })
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => (await this.http.post<T>(path, body)).data)
  }

  async delete<T>(path: string): Promise<T> {
    return withRetry(async () => (await this.http.delete<T>(path)).data)
  }
}
