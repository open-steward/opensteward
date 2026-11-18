import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

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

/**
 * Mural's documented paging envelope (searchpayoutrequests.md, searchpayins.md):
 * "PaginatedResponse": { "properties": { "nextId": { "format": "uuid", "type": "string" },
 * "total": { "type": "number" } }, "required": ["total"] }, allOf'd with
 * { "results": [...] }.
 */
export interface MuralPaginated<T> {
  total: number
  nextId?: string
  results?: T[]
}

export class MuralPayClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    // "It should be provided via Bearer Authentication in the request header
    // for *all* requests." (https://developers.muralpay.com/docs/get-api-key.md)
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => (await this.http.get<T>(path, { params })).data)
  }

  /** POST with a JSON body and, separately, query parameters (Mural's search endpoints take `limit`/`nextId` in the query). */
  async post<T>(path: string, body?: unknown, params?: Record<string, unknown>): Promise<T> {
    return withRetry(
      async () => (await this.http.post<T>(path, body, params ? { params } : undefined)).data,
    )
  }

  async delete<T>(path: string): Promise<T> {
    return withRetry(async () => (await this.http.delete<T>(path)).data)
  }
}
