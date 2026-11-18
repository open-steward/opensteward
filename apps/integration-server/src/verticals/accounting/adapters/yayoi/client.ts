/**
 * Misoca (Yayoi) HTTP client.
 *
 * Base URL:   https://app.misoca.jp/api/v3/
 * Auth header: Authorization: Bearer {access_token}
 * Pagination:  page / per_page query params; RFC 5988 Link header for cursor
 *
 * Docs: https://doc.misoca.jp/v3/
 */

import axios, { type AxiosInstance } from 'axios'
import { MISOCA_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class MisocaClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: MISOCA_API_BASE,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json;charset=UTF-8',
        Accept: 'application/json',
      },
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
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

  async delete<T>(path: string): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.delete<T>(path)
      return data
    })
  }
}
