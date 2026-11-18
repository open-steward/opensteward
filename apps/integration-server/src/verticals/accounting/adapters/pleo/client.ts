/**
 * Pleo REST API client.
 *
 * Base URL: https://openapi.pleo.io/v1
 * Auth:     Bearer token in Authorization header
 * Pagination: cursor-based (after/before) or offset-based (pageOffset/pageSize)
 *
 * Docs: https://developers.pleo.io/reference/pagination
 */

import axios, { type AxiosInstance } from 'axios'
import { PLEO_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

export interface PleoPageParams {
  pageSize?: number
  pageOffset?: number
  after?: string
}

export interface PleoPageInfo {
  hasNextPage?: boolean
  hasPreviousPage?: boolean
  startCursor?: string
  endCursor?: string
  total?: number
}

export interface PleoListResponse<T> {
  data: T[]
  pagination?: {
    pageInfo?: PleoPageInfo
  }
}

export class PleoClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: `${PLEO_API_BASE}/`,
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

  async listAll<T>(
    path: string,
    pageSize: number,
    extraParams?: Record<string, unknown>,
  ): Promise<T[]> {
    const results: T[] = []
    let offset = 0
    while (true) {
      const res = await this.get<PleoListResponse<T>>(path, {
        pageSize,
        pageOffset: offset,
        ...extraParams,
      })
      const items = res.data ?? []
      results.push(...items)
      const hasNext = res.pagination?.pageInfo?.hasNextPage
      if (!hasNext || items.length < pageSize) break
      offset += pageSize
    }
    return results
  }
}
