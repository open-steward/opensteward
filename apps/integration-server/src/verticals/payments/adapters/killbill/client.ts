import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { resolveConnection } from './auth'

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

export class KillbillClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const conn = resolveConnection(credentials)
    this.http = axios.create({
      baseURL: conn.serverUrl,
      headers: {
        Authorization: `Basic ${credentials.accessToken}`,
        'X-Killbill-ApiKey': conn.apiKey,
        'X-Killbill-ApiSecret': conn.apiSecret,
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
   * GET that also returns the response headers, keys lowercased. Kill Bill's
   * `/pagination` endpoints carry their next signal in headers
   * (X-Killbill-Pagination-NextOffset, -TotalNbRecords), not in the body.
   */
  async getWithHeaders<T>(
    path: string,
    params?: Record<string, unknown>,
  ): Promise<{ data: T; headers: Record<string, string | undefined> }> {
    return withRetry(async () => {
      const res = await this.http.get<T>(path, { params })
      const headers: Record<string, string | undefined> = {}
      for (const [k, v] of Object.entries((res.headers ?? {}) as Record<string, unknown>)) {
        if (v !== undefined && v !== null) headers[k.toLowerCase()] = String(v)
      }
      return { data: res.data, headers }
    })
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => (await this.http.post<T>(path, body)).data)
  }

  async delete<T>(path: string): Promise<T> {
    return withRetry(async () => (await this.http.delete<T>(path)).data)
  }
}
