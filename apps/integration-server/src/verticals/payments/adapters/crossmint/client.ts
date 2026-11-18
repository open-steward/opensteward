/**
 * Crossmint REST API client — thin axios wrapper.
 *
 * Auth is a server-side API key sent in the `X-API-KEY` header; the base URL is
 * derived from the key prefix (staging vs production). Bodies are JSON.
 *
 * Crossmint's checkout surface is fetch-by-id only (orders have no list
 * endpoint), so there is no cursor/offset pagination to model here.
 *
 * Docs: https://docs.crossmint.com/api-reference/introduction
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { baseUrlForKey } from './constants'

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

export class CrossmintClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const apiKey = credentials.accessToken ?? ''
    this.http = axios.create({
      baseURL: baseUrlForKey(apiKey),
      headers: {
        'X-API-KEY': apiKey,
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
