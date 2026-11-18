/**
 * Invoice Ninja v5 HTTP client.
 *
 * Auth: X-API-TOKEN header with the static API key stored in `credentials.accessToken`.
 * Base URL: https://invoicing.co/api/v1/  (cloud-hosted) or a self-hosted instance.
 *
 * Pagination: query params `per_page` and `page` (1-indexed).
 * Response envelope for lists:
 *   { data: T[], meta: { pagination: { total, count, per_page, current_page, total_pages } } }
 * Response envelope for single objects:
 *   { data: T }
 */

import axios, { type AxiosInstance } from 'axios'
import { INVOICE_NINJA_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

/** Pagination meta returned by Invoice Ninja list endpoints */
export interface InvoiceNinjaPagination {
  total: number
  count: number
  per_page: number
  current_page: number
  total_pages: number
}

/** List response envelope */
export interface InvoiceNinjaListResponse<T> {
  data: T[]
  meta: {
    pagination: InvoiceNinjaPagination
  }
}

/** Single-object response envelope */
export interface InvoiceNinjaSingleResponse<T> {
  data: T
}

export class InvoiceNinjaClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, baseURL?: string) {
    this.http = axios.create({
      baseURL: baseURL ?? INVOICE_NINJA_API_BASE,
      headers: {
        'X-API-TOKEN': credentials.accessToken,
        'X-Requested-With': 'XMLHttpRequest',
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

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  async put<T>(path: string, body: unknown): Promise<T> {
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
