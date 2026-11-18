/**
 * Geidea Direct API client — thin axios wrapper.
 *
 * Auth is HTTP Basic: `Authorization: Basic base64(merchantPublicKey:apiPassword)`.
 * The base host is resolved per region (Egypt/UAE default vs KSA). Request and
 * response bodies are JSON. The order-search endpoint paginates with `Skip` /
 * `Take` query params; there is no cursor.
 *
 * Docs: https://docs.geidea.net/docs/pg-direct-api
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { baseUrlForRegion } from './constants'
import { merchantPublicKey, apiPassword, region } from './auth'

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

export class GeideaClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const basic = Buffer.from(
      `${merchantPublicKey(credentials)}:${apiPassword(credentials)}`,
      'utf8',
    ).toString('base64')
    this.http = axios.create({
      baseURL: baseUrlForRegion(region(credentials)),
      headers: {
        Authorization: `Basic ${basic}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => (await this.http.get<T>(path, { params })).data)
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => (await this.http.post<T>(path, body)).data)
  }
}
