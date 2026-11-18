/**
 * myBillBook HTTP client.
 *
 * Auth: X-API-KEY header with the static API key stored in `credentials.accessToken`.
 * Base URL: https://mybillbook.in/api/
 *
 * Pagination: query params `page` (1-indexed) and `limit`.
 * List response envelope:
 *   { success: true, data: T[], total: number, page: number, limit: number }
 * Single-object response envelope:
 *   { success: true, data: T }
 */

import axios, { type AxiosInstance } from 'axios'
import { MYBILLBOOK_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

/** List response envelope returned by myBillBook list endpoints */
export interface MybillbookListResponse<T> {
  success: boolean
  data: T[]
  total: number
  page: number
  limit: number
}

/** Single-object response envelope */
export interface MybillbookSingleResponse<T> {
  success: boolean
  data: T
}

export class MybillbookClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: MYBILLBOOK_API_BASE,
      headers: {
        'X-API-KEY': credentials.accessToken,
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
