/**
 * Instamojo MDP v2 REST client: a thin axios wrapper.
 *
 * Auth, from the MDP OpenAPI (e.g. https://docs.instamojo.com/v2-mdp/reference/payments):
 *   "securitySchemes": { "sec0": { "type": "apiKey", "name": "Authorization",
 *   "in": "header", "x-default": "Bearer {{access_token}}" } }
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
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

/**
 * The documented list envelope of List Payments / List Payouts:
 * `{ count, next, previous, <resource>: [...] }`.
 */
export type ListEnvelope<K extends string, T> = {
  count?: number
  next?: string | null
  previous?: string | null
} & { [P in K]?: T[] }

export class InstamojoClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }
}
