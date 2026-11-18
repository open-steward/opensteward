import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'
import { readCredentials } from './auth'

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
 * Salt Edge v6 wraps every response as `{ data, meta }`. Paginated lists carry
 * `meta.next_id` (the resource id the next page starts at) and `meta.next_page`
 * (a ready-made relative URL). Pass `from_id` to fetch the following page.
 */
export interface SaltEdgeEnvelope<T> {
  data?: T
  meta?: {
    next_id?: string | number | null
    next_page?: string | null
  }
  error?: { class?: string; message?: string }
}

export class SaltEdgeClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const { appId, secret } = readCredentials(credentials)
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'App-id': appId,
        Secret: secret,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<SaltEdgeEnvelope<T>> {
    return withRetry(
      async () => (await this.http.get<SaltEdgeEnvelope<T>>(path, { params })).data,
    )
  }

  async post<T>(path: string, body?: unknown): Promise<SaltEdgeEnvelope<T>> {
    return withRetry(async () => (await this.http.post<SaltEdgeEnvelope<T>>(path, body)).data)
  }

  async delete<T>(path: string): Promise<SaltEdgeEnvelope<T>> {
    return withRetry(async () => (await this.http.delete<SaltEdgeEnvelope<T>>(path)).data)
  }
}
