/**
 * Sana Commerce web service client.
 *
 * Features:
 *  - Obtains a session ticket via `customer/login` at construction time.
 *  - Sends the ticket in the `Ticket` HTTP header on every subsequent request.
 *  - Accepts `LanguageId` and `CurrencyId` headers from credentials.extra.
 *  - Page-based pagination: `?pageIndex=N` (0-indexed), `?pageSize=N`.
 *  - Exponential back-off on HTTP 429 and 5xx responses.
 *
 * Base URL shape: `{siteUrl}/api/CommerceService.svc/{method}`
 * Example:       `https://store.example.com/api/CommerceService.svc/catalog/productcategories`
 *
 * Docs:
 *  https://help.sana-commerce.com/sana-commerce-90/how_tos/web-service-developer-guide/api-methods
 *  https://help.sana-commerce.com/sana-commerce-83/how_tos/web-service-developer-guide/general-behaviour-and-http-headers
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, WS_PATH } from './constants'
import { obtainTicket } from './auth'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      const retryable = status === 429 || (status != null && status >= 500 && status < 600)
      if (retryable && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 800))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export interface ListResult<T> {
  items: T[]
  /** Next 0-indexed page number, undefined when on the last page. */
  nextPage?: number
}

export class SanaCommerceClient {
  private _http?: AxiosInstance
  private baseUrl: string
  private credentials: Credentials

  // Lazily-resolved ticket promise — shared across the lifetime of this client.
  private ticketPromise?: Promise<string>

  constructor(credentials: Credentials) {
    const siteUrl = credentials.extra?.['siteUrl'] as string | undefined
    if (!siteUrl) {
      throw new Error(
        'SanaCommerceClient: credentials.extra.siteUrl is required ' +
          '(e.g. https://store.example.com)',
      )
    }
    this.credentials = credentials
    this.baseUrl = `${siteUrl.replace(/\/$/, '')}${WS_PATH}`
  }

  /** Resolve (and cache) the session ticket. */
  private ticket(): Promise<string> {
    if (!this.ticketPromise) {
      const siteUrl = this.credentials.extra?.['siteUrl'] as string
      const username = this.credentials.extra?.['username'] as string | undefined
      const password = this.credentials.accessToken

      if (!username) {
        return Promise.reject(
          new Error('SanaCommerceClient: credentials.extra.username is required'),
        )
      }
      if (!password) {
        return Promise.reject(
          new Error('SanaCommerceClient: credentials.accessToken (password) is required'),
        )
      }

      this.ticketPromise = obtainTicket(siteUrl, username, password)
    }
    return this.ticketPromise
  }

  /** Build an authenticated axios instance once the ticket is known. */
  private async httpClient(): Promise<AxiosInstance> {
    if (this._http) return this._http
    const ticket = await this.ticket()
    const languageId = (this.credentials.extra?.['languageId'] as string | undefined) ?? ''
    const currencyId = (this.credentials.extra?.['currencyId'] as string | undefined) ?? ''
    const headers: Record<string, string> = {
      Ticket: ticket,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
    if (languageId) headers['LanguageId'] = languageId
    if (currencyId) headers['CurrencyId'] = currencyId

    this._http = axios.create({
      baseURL: this.baseUrl,
      headers,
      timeout: 30_000,
    })
    return this._http
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const http = await this.httpClient()
      const { data } = await http.get<T>(path, { params })
      return data
    })
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const http = await this.httpClient()
      const { data } = await http.put<T>(path, body)
      return data
    })
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const http = await this.httpClient()
      const { data } = await http.post<T>(path, body)
      return data
    })
  }

  /**
   * Page-based list helper.
   *
   * Sana Commerce paginates via `?pageIndex=N&pageSize=N` query parameters
   * (0-indexed pages). The response is an array — when the returned array is
   * shorter than `pageSize`, we have reached the last page.
   *
   * @param path     Web service path, e.g. `catalog/productcategories`
   * @param pageSize Number of items per page (capped at MAX_PAGE_SIZE)
   * @param page     0-indexed page number
   * @param extra    Additional query params forwarded verbatim
   */
  async listWithPage<T>(
    path: string,
    pageSize: number = DEFAULT_PAGE_SIZE,
    page: number = 0,
    extra: Record<string, unknown> = {},
  ): Promise<ListResult<T>> {
    const size = Math.min(pageSize, MAX_PAGE_SIZE)
    const params: Record<string, unknown> = {
      ...extra,
      pageIndex: page,
      pageSize: size,
    }
    const items = await this.get<T[] | T>(path, params)
    const arr = Array.isArray(items) ? items : []
    return {
      items: arr as T[],
      nextPage: arr.length >= size ? page + 1 : undefined,
    }
  }
}
