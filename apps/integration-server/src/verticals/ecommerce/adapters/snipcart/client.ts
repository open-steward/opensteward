/**
 * Snipcart REST API client.
 *
 * Features:
 *  - HTTP Basic auth: API key as username, empty password, base64-encoded.
 *  - Offset/limit collections answer `{ totalItems, offset, limit, items[] }`;
 *    the adapter derives the offset from the caller page (see index.ts).
 *  - 429 retry with exponential backoff.
 *
 * Docs: https://docs.snipcart.com/v3/api-reference/introduction
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { BASE_URL } from './constants'
import { buildBasicAuthHeader } from './auth'

/** Snipcart list response envelope. */
export interface SnipcartListResponse<T> {
  totalItems: number
  offset: number
  limit: number
  items: T[]
}

export class SnipcartClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: BASE_URL,
      headers: {
        Authorization: buildBasicAuthHeader(credentials.accessToken),
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

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body)
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }
}
