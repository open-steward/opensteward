import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_REGION, HOSTS, type KlarnaRegion } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const e = err as AxiosError
      const status = e.response?.status
      if ((status === 429 || (status !== undefined && status >= 500)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class KlarnaClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const region =
      ((credentials.extra as Record<string, unknown> | undefined)?.region as KlarnaRegion) ??
      DEFAULT_REGION
    this.http = axios.create({
      baseURL: HOSTS[region],
      headers: {
        Authorization: `Basic ${credentials.accessToken}`,
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
