/**
 * Bagy REST API client.
 *
 * Features:
 *  - `access_token` passed as a query parameter on every request.
 *  - The base URL is `https://{api_address}/web_api`, where `api_address`
 *    is stored in `credentials.extra.apiAddress`.
 *  - Page-based pagination: `page` + `limit` (max 50) parameters, with
 *    metadata returned in the `paging` envelope field.
 *  - Simple 429 / 5xx retry with exponential backoff.
 *
 * Docs: https://developers.bagy.com.br/
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const e = err as AxiosError
      const status = e.response?.status
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

export interface BagyPaging {
  total?: number
  page?: number
  limit?: number
  offset?: number
  maxLimit?: number
}

export interface ListResult<T> {
  items: T[]
  paging?: BagyPaging
  nextPage?: number
}

/**
 * Build the Bagy API base URL from a credentials object.
 * Falls back to the constructor-provided apiAddress if `extra` is absent.
 */
function resolveBaseUrl(credentials: Credentials, fallbackApiAddress: string): string {
  const apiAddress =
    (credentials.extra?.['apiAddress'] as string | undefined) ?? fallbackApiAddress
  const base = apiAddress.startsWith('http') ? apiAddress : `https://${apiAddress}`
  return `${base.replace(/\/$/, '')}/web_api`
}

export class BagyClient {
  private http: AxiosInstance
  private accessToken: string

  constructor(credentials: Credentials, fallbackApiAddress: string) {
    this.accessToken = credentials.accessToken
    const baseURL = resolveBaseUrl(credentials, fallbackApiAddress)
    this.http = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  private authParams(): Record<string, string> {
    return { access_token: this.accessToken }
  }

  async get<T>(path: string, params: Record<string, unknown> = {}): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        params: { ...this.authParams(), ...params },
      })
      return data
    })
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        params: this.authParams(),
      })
      return data
    })
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body, {
        params: this.authParams(),
      })
      return data
    })
  }

  async delete(path: string, params: Record<string, unknown> = {}): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path, {
        params: { ...this.authParams(), ...params },
      })
    })
  }

  /**
   * List helper that handles Bagy's page-based pagination. The response
   * envelope is expected to be `{ [resourceKey]: T[], paging: {...} }`.
   */
  async listWithPage<T>(
    path: string,
    resourceKey: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const limit = Math.min(
      (extraParams['limit'] as number | undefined) ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const page = (extraParams['page'] as number | undefined) ?? 1

    const params: Record<string, unknown> = { ...extraParams, limit, page }
    delete params['limit'] // normalised above
    params['limit'] = limit

    const raw = await this.get<Record<string, unknown>>(path, params)

    const items = (raw[resourceKey] ?? []) as T[]
    const paging = raw['paging'] as BagyPaging | undefined

    let nextPage: number | undefined
    if (paging?.total != null && paging?.limit != null) {
      const totalPages = Math.ceil(paging.total / paging.limit)
      if ((paging.page ?? 1) < totalPages) {
        nextPage = (paging.page ?? 1) + 1
      }
    }

    return { items, paging, nextPage }
  }
}
