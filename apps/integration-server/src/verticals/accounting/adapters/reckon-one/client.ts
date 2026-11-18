/**
 * Reckon One API v2 HTTP client.
 *
 * Base URL: https://api.reckon.com/R1/{cashbookId}/
 * Auth: Bearer token in Authorization header.
 * Pagination: $top / $skip OData query parameters (max 100 records per page).
 *
 * Docs: https://developer.reckon.com / https://api-v2.reckonone.com/swagger
 */

import axios, { type AxiosInstance } from 'axios'
import { RECKON_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export class ReckonOneClient {
  private http: AxiosInstance
  readonly cashbookId: string

  constructor(credentials: Credentials) {
    const cashbookId = credentials.tenantId ?? ''
    this.cashbookId = cashbookId
    this.http = axios.create({
      baseURL: `${RECKON_API_BASE}/${cashbookId}/`,
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

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }

  /**
   * Fetch a paginated list of resources.
   * Reckon One uses OData-style $top/$skip (or offset-based page parameter).
   * Returns the items array from the response envelope.
   */
  async list<T>(path: string, page: number, pageSize: number, extra?: Record<string, unknown>): Promise<T[]> {
    const skip = (page - 1) * pageSize
    const res = await this.get<T[] | { items?: T[]; data?: T[] }>(path, {
      $top: pageSize,
      $skip: skip,
      ...extra,
    })
    // Reckon One v2 may return a plain array or an envelope
    if (Array.isArray(res)) return res
    const env = res as { items?: T[]; data?: T[] }
    return env.items ?? env.data ?? []
  }
}
