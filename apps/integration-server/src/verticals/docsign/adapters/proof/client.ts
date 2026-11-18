/**
 * Proof REST API client.
 *
 * Proof authenticates with a custom `ApiKey` header carrying the raw key
 * (no Bearer prefix) + JSON. List endpoints use `offset` + `limit` and
 * return a `{ data, count, total_count }` envelope.
 *
 * Docs: https://dev.proof.com/docs/api-keys
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { baseUrlForKey, API_KEY_HEADER } from './constants'

export class ProofClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const apiKey = credentials.accessToken ?? ''
    this.http = axios.create({
      baseURL: baseUrlForKey(apiKey),
      headers: {
        [API_KEY_HEADER]: credentials.accessToken ?? '',
        'Content-Type': 'application/json',
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

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }
}
