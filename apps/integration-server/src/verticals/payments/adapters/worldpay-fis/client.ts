import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_ENVIRONMENT, HOSTS, type WorldpayEnvironment } from './constants'

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

export class WorldpayClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const extra = (credentials.extra as Record<string, unknown> | undefined) ?? {}
    const env = (extra.environment as WorldpayEnvironment) ?? DEFAULT_ENVIRONMENT
    const auth = extra.authStyle === 'basic'
      ? `Basic ${credentials.accessToken}`
      : `Bearer ${credentials.accessToken}`
    this.http = axios.create({
      baseURL: HOSTS[env],
      headers: {
        Authorization: auth,
        Accept: 'application/vnd.worldpay.payments-v7+json',
        'Content-Type': 'application/vnd.worldpay.payments-v7+json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string): Promise<T> {
    return withRetry(async () => (await this.http.get<T>(path)).data)
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => (await this.http.post<T>(path, body)).data)
  }
}
