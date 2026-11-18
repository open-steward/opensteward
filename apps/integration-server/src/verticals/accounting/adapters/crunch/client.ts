import axios, { type AxiosInstance } from 'axios'
import { CRUNCH_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

/**
 * Thin HTTP client for the Crunch public REST API.
 *
 * Base URL: https://public-api.crunch.co.uk/v1
 * Auth:     Authorization: Bearer <access_token>
 * Pagination: zero-indexed `page`, max `size` 200.
 */
export class CrunchClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: `${CRUNCH_API_BASE}/`,
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

  async delete<T>(path: string): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.delete<T>(path)
      return data
    })
  }

  /**
   * Collect all pages of a paginated Crunch endpoint.
   * Crunch uses zero-indexed pages with a `content` array in the response.
   */
  async getAllPages<T>(
    path: string,
    extraParams?: Record<string, unknown>,
    pageSize = 200,
  ): Promise<T[]> {
    const results: T[] = []
    let page = 0
    let totalPages = 1

    while (page < totalPages) {
      const res = await this.get<CrunchPage<T>>(path, {
        ...extraParams,
        page,
        size: pageSize,
      })
      results.push(...(res.content ?? []))
      totalPages = res.totalPages ?? 1
      page++
    }
    return results
  }
}

/** Generic Crunch Spring-data page envelope. */
export interface CrunchPage<T> {
  content: T[]
  totalPages: number
  totalElements: number
  numberOfElements: number
  first: boolean
  last: boolean
  empty: boolean
  size: number
  number: number
}
