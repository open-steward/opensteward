/**
 * Interswitch payment-gateway client — thin axios wrapper.
 *
 * Requests carry `Authorization: Bearer <token>` (reference/get-transactions.md:
 * "Set value to \"Bearer <token>\""). The token comes from the client-credentials
 * grant (see auth.ts) and is re-minted when it is missing or past `expiresAt`.
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

export class InterswitchClient {
  private http: AxiosInstance
  private credentials: Credentials

  constructor(credentials: Credentials) {
    this.credentials = credentials
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      timeout: 30_000,
    })
  }

  private async token(): Promise<string> {
    const expired =
      !this.credentials.accessToken ||
      (this.credentials.expiresAt !== undefined &&
        new Date(this.credentials.expiresAt).getTime() <= Date.now())
    if (expired) {
      const { clientId, secretKey } = readExtra(this.credentials)
      if (clientId && secretKey) this.credentials = await mintToken(clientId, secretKey)
    }
    return this.credentials.accessToken
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const token = await this.token()
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        params,
        headers: { Authorization: `Bearer ${token}` },
      })
      return data
    })
  }
}
