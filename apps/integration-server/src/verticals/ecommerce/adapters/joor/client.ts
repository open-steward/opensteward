/**
 * JOOR v4 REST API client.
 *
 * Features:
 *  - `Authorization: Bearer <token>` auth header.
 *  - 429 retry with exponential backoff (JOOR uses a credit-based rate limit
 *    with a 300-second window; `Retry-After` / `X-Throttling-Resets-In` is
 *    respected when present).
 *  - `listWithPage` helper for order pagination (page + page_size params).
 *  - All JOOR list endpoints require `account` (JOOR Account ID) as a query
 *    parameter; the client injects it automatically from credentials.extra.
 *
 * Docs: https://api-docs.jooraccess.com/reference/throttling.md
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, API_BASE_URL_SANDBOX, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

/** JOOR wraps every list response in `{ data: T[], errors: [...] }`. */
export interface JoorListResponse<T> {
  data: T[]
  errors?: Array<{ status: string; message: string; details?: unknown }>
}

export interface ListResult<T> {
  items: T[]
  nextPage?: number
}

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      const retryable = status === 429 || (status != null && status >= 500 && status < 600)
      if (retryable && attempt < retries) {
        // Honour JOOR's throttle-reset header when available.
        const resetsIn =
          axiosErr.response?.headers?.['x-throttling-resets-in'] ??
          axiosErr.response?.headers?.['retry-after']
        const waitMs = resetsIn ? Math.ceil(parseFloat(String(resetsIn))) * 1000 : Math.pow(2, attempt) * 1000
        await new Promise((r) => setTimeout(r, waitMs))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class JoorClient {
  private http: AxiosInstance
  /** JOOR Account ID — required on every list/mutation request. */
  private accountId: string

  constructor(credentials: Credentials) {
    const sandbox = Boolean(credentials.extra?.['sandbox'])
    const accountId = credentials.extra?.['accountId'] as string | undefined
    if (!accountId) {
      throw new Error(
        'JoorClient: credentials.extra.accountId is required. ' +
          'Set it when creating the connection.',
      )
    }
    this.accountId = accountId
    this.http = axios.create({
      baseURL: sandbox ? API_BASE_URL_SANDBOX : API_BASE_URL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /** Inject the mandatory `account` query param into every request. */
  private withAccount(params?: Record<string, unknown>): Record<string, unknown> {
    return { account: this.accountId, ...params }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params: this.withAccount(params) })
      return data
    })
  }

  async post<T>(path: string, body?: unknown, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        params: this.withAccount(params),
      })
      return data
    })
  }

  /**
   * List helper for JOOR endpoints that support page-based pagination
   * (orders). Products/collections return everything in one call.
   */
  async listWithPage<T>(
    path: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const pageSize = Math.min(
      (extraParams['page_size'] as number | undefined) ??
        (extraParams['limit'] as number | undefined) ??
        DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const page = (extraParams['page'] as number | undefined) ?? 1
    const params: Record<string, unknown> = { ...extraParams, page_size: pageSize, page }
    delete params['limit']

    const res = await this.get<JoorListResponse<T>>(path, params)
    // JOOR does not return a Link header — derive `nextPage` heuristically:
    // if the returned page is full, there may be more.
    const items = res.data ?? []
    const nextPage = items.length >= pageSize ? page + 1 : undefined
    return { items, nextPage }
  }
}
