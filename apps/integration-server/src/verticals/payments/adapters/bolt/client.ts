import { randomInt } from 'node:crypto'
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
 * Generate the per-request `X-Nonce` Bolt expects: a unique 12-16 digit
 * identifier. We emit 16 digits with no leading zero.
 */
function nonce(): string {
  let out = String(randomInt(1, 10))
  for (let i = 0; i < 15; i++) out += String(randomInt(0, 10))
  return out
}

/**
 * Thin Bolt merchant REST client.
 *
 * Auth is the static API key carried in the `X-Api-Key` header (Bolt does not
 * use Bearer tokens for merchant API calls). Each request also carries a
 * unique `X-Nonce`. Bodies are JSON.
 *
 * Bolt's transaction endpoints are single-resource — retrieve / capture /
 * void / refund by `transaction_reference` — so there is no list cursor to
 * thread here; callers that need limits clamp them before calling.
 */
export class BoltClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'X-Api-Key': credentials.accessToken ?? '',
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        params,
        headers: { 'X-Nonce': nonce() },
      })
      return data
    })
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        headers: { 'X-Nonce': nonce() },
      })
      return data
    })
  }
}
