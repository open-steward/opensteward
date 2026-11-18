/**
 * Puzzle REST API client.
 *
 * Base URL:  https://api.puzzle.io/rest/v0
 * Auth:      Authorization: Bearer <access_token>
 * Pagination: cursor-based, in two dialects —
 *   `count` + `after`, answered with pageInfo { endCursor, hasNextPage, total }
 *   (invoices, bills, customers, vendors, transactions);
 *   `limit` + `cursor`, answered with pageInfo { nextCursor } (journalEntries).
 *
 * All company-scoped endpoints include the company ID in the path:
 *   /company/{companyId}/invoices
 */

import axios, { type AxiosInstance } from 'axios'
import { PUZZLE_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

/** `pageInfo` of the count/after endpoints; `endCursor` and `total` are nullable in the spec. */
export interface PuzzlePageInfo {
  hasNextPage: boolean
  endCursor?: string | null
  total?: number | null
}

export class PuzzleClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: PUZZLE_API_BASE,
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

  async put<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body)
      return data
    })
  }
}
