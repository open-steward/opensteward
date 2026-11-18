/**
 * Bumpa REST API client.
 *
 * Features:
 *  - `Authorization: Bearer <api-key>` auth header.
 *  - 429 / 5xx retry with exponential backoff.
 *  - `listWithPage` helper that reads Bumpa's Laravel-style pagination
 *    envelope (`current_page`, `per_page`, `total`, `last_page`,
 *    `next_page_url`, `data`) and returns items + next page number.
 *
 * Base URL: https://api.getbumpa.com/v1
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { BASE_URL, API_PREFIX, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      const retryable = status === 429 || (status != null && status >= 500 && status < 600)
      if (retryable && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/**
 * Bumpa Laravel-style paginated response envelope.
 *
 * `data` contains the items; top-level fields describe the page position.
 */
export interface BumpaPagedResponse<T> {
  data: T[]
  current_page: number
  per_page: number
  total: number
  last_page: number
  next_page_url: string | null
}

export interface ListResult<T> {
  items: T[]
  /** Page number to pass for the next call, or undefined if last page. */
  nextPage?: number
  total?: number
}

export class BumpaClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: `${BASE_URL}${API_PREFIX}`,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
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

  async put<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body)
      return data
    })
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
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

  /**
   * Fetch a paginated list from a Bumpa endpoint.
   *
   * Bumpa responses are wrapped in a Laravel pagination envelope:
   *   { data: T[], current_page, per_page, total, last_page, next_page_url }
   *
   * The caller passes any extra query params (filters, sort, etc.) and the
   * helper handles page/per_page normalization.
   */
  async listWithPage<T>(
    path: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const perPage = Math.min(
      (extraParams['per_page'] as number | undefined) ??
        (extraParams['limit'] as number | undefined) ??
        DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const page = (extraParams['page'] as number | undefined) ?? 1

    const params: Record<string, unknown> = { ...extraParams }
    delete params['limit']
    params['per_page'] = perPage
    params['page'] = page

    const res = await this.get<BumpaPagedResponse<T>>(path, params)

    const currentPage = res.current_page ?? page
    const lastPage = res.last_page ?? 1
    const nextPage = currentPage < lastPage ? currentPage + 1 : undefined

    return {
      items: res.data ?? [],
      nextPage,
      total: res.total,
    }
  }
}
