/**
 * Soldo API HTTP client.
 *
 * All requests require `Authorization: Bearer {access_token}`.
 * Pagination uses query params: p (0-indexed page), s (page size ≤ 50).
 * Response envelope: { results: T[], total, pages, page_size, current_page, results_size }
 */

import axios, { type AxiosInstance } from 'axios'
import { SOLDO_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export interface SoldoPagedResponse<T> {
  results: T[]
  total: number
  pages: number
  page_size: number
  current_page: number
  results_size: number
}

export class SoldoClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: SOLDO_API_BASE + '/',
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
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

  async getPaged<T>(
    path: string,
    page: number,
    size: number,
    extra?: Record<string, unknown>,
  ): Promise<SoldoPagedResponse<T>> {
    return this.get<SoldoPagedResponse<T>>(path, { p: page, s: size, ...extra })
  }
}
