import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'
import { readInstance } from './auth'

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
 * Auth is the X-API-KEY header and every call carries `?instance=`
 * (https://developers.payrexx.com/reference/rest-api.md). "For POST requests
 * all query parameters except the instance have to be in the body."
 */
export class PayrexxClient {
  private http: AxiosInstance
  private instance: string

  constructor(credentials: Credentials) {
    this.instance = readInstance(credentials)
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'X-API-KEY': credentials.accessToken,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(
      async () =>
        (await this.http.get<T>(path, { params: { ...params, instance: this.instance } })).data,
    )
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(
      async () =>
        (await this.http.post<T>(path, body, { params: { instance: this.instance } })).data,
    )
  }

  async delete<T>(path: string): Promise<T> {
    return withRetry(
      async () => (await this.http.delete<T>(path, { params: { instance: this.instance } })).data,
    )
  }
}
