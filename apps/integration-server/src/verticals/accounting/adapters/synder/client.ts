/**
 * HTTP client for the Synder Importer API.
 *
 * Base URL:  https://importer.synder.com/api/v1
 * Auth:      Bearer token in Authorization header
 * Pagination: page / perPage query params; response includes pagination object
 *
 * Docs: https://importer.synder.com/apidocs
 */

import axios, { type AxiosInstance } from 'axios'
import { SYNDER_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export interface SynderPaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    perPage: number
    total: number
    totalPages: number
  }
}

export class SynderClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: SYNDER_API_BASE,
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

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  async getPaginated<T>(
    path: string,
    page: number,
    perPage: number,
    params?: Record<string, unknown>,
  ): Promise<SynderPaginatedResponse<T>> {
    return this.get<SynderPaginatedResponse<T>>(path, { ...params, page, perPage })
  }
}
