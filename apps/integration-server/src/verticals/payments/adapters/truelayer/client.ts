/**
 * TrueLayer Payments API v3 client: a thin axios wrapper.
 *
 * Every request carries `Authorization: Bearer <access_token>`, the token from
 * the client-credentials grant (auth.ts). The token expires, so the client
 * mints a new one when it is missing or past `expiresAt`, and once more on a
 * 401.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'
import { mintToken, readExtra } from './auth'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const status = (err as AxiosError).response?.status
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

export class TrueLayerClient {
  private http: AxiosInstance
  private credentials: Credentials

  constructor(credentials: Credentials) {
    this.credentials = credentials
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: { Accept: 'application/json' },
      timeout: 30_000,
    })
  }

  private async ensureToken(): Promise<string> {
    const expiresAt = this.credentials.expiresAt
    const expired =
      !this.credentials.accessToken ||
      (expiresAt !== undefined && new Date(expiresAt).getTime() <= Date.now())
    if (expired) this.credentials = await mintToken(readExtra(this.credentials))
    return this.credentials.accessToken
  }

  async get<T>(
    path: string,
    params?: Record<string, unknown>,
    headers?: Record<string, string>,
  ): Promise<T> {
    return withRetry(async () => {
      const token = await this.ensureToken()
      try {
        const { data } = await this.http.get<T>(path, {
          params,
          headers: { ...headers, Authorization: `Bearer ${token}` },
        })
        return data
      } catch (err) {
        if ((err as AxiosError).response?.status !== 401) throw err
        this.credentials = await mintToken(readExtra(this.credentials))
        const { data } = await this.http.get<T>(path, {
          params,
          headers: { ...headers, Authorization: `Bearer ${this.credentials.accessToken}` },
        })
        return data
      }
    })
  }
}
