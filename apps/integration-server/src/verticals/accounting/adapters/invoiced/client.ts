/**
 * Invoiced REST client.
 *
 * Auth: HTTP Basic — API key as username, empty password.
 * Base URL: https://api.invoiced.com  (or sandbox)
 * Pagination: `page` / `per_page` query params; `X-Total-Count` response header.
 *
 * Docs: https://developer.invoiced.com/api
 */
import axios, { type AxiosInstance } from 'axios'
import { INVOICED_API_BASE } from './constants'
import { buildAuthHeader } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export interface InvoicedPage<T> {
  items: T[]
  totalCount: number
}

export class InvoicedClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const apiKey = credentials.accessToken
    this.http = axios.create({
      baseURL: INVOICED_API_BASE,
      headers: {
        Authorization: buildAuthHeader(apiKey),
        'Content-Type': 'application/json',
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

  /** Fetches a paginated list endpoint and returns items + total count. */
  async list<T>(path: string, params?: Record<string, unknown>): Promise<InvoicedPage<T>> {
    return withRetry(async () => {
      const { data, headers } = await this.http.get<T[]>(path, { params })
      const totalCount = parseInt(headers['x-total-count'] ?? '0', 10) || 0
      return { items: data ?? [], totalCount }
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.patch<T>(path, body)
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }
}
