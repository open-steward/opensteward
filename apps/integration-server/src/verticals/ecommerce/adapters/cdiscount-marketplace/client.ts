/**
 * Octopia Seller API HTTP client (Cdiscount Marketplace).
 *
 * Every call needs `Authorization: Bearer {accessToken}` AND a `SellerId`
 * header — the Octopia seller identifier, distinct from the OAuth client.
 *
 * List responses share one verified envelope shape —
 * `{ itemsPerPage: number, items: T[] }` — confirmed verbatim from the docs
 * for both `GET /products` and `GET /orders`; applied to `GET
 * /seller/v2/offers` too since its reference page documents the identical
 * `{ items, itemsPerPage }` shape. `/products` and `/seller/v2/offers`
 * paginate by `cursor` + `limit`, surfacing the next cursor via a standard
 * `Link: <...>; rel="next"` header. `/orders` instead uses `pageIndex` +
 * `pageSize` (1-indexed) — a true offset, so only whether a next page
 * exists (also read from `Link`) matters, not a cursor value.
 *
 * Docs: https://developer.octopia-io.net/api-reference/
 */
import axios, { type AxiosInstance, type AxiosResponse } from 'axios'
import { withRetry } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, DEFAULT_PAGE_SIZE, MAX_PRODUCT_PAGE_SIZE } from './constants'

/** True when a `Link` header (RFC 5988) carries a `rel="next"` entry. */
export function hasNextLink(linkHeader: string | undefined): boolean {
  if (!linkHeader) return false
  return linkHeader.split(',').some((part) => /rel="next"/i.test(part))
}

/** Parse a `Link` header (RFC 5988) for the `rel="next"` URL's `cursor` param. */
export function parseNextCursor(linkHeader: string | undefined): string | undefined {
  if (!linkHeader) return undefined
  for (const part of linkHeader.split(',')) {
    const match = /<([^>]+)>;\s*rel="next"/i.exec(part)
    if (match) {
      try {
        return new URL(match[1]!).searchParams.get('cursor') ?? undefined
      } catch {
        return undefined
      }
    }
  }
  return undefined
}

export interface CursorListResult<T> {
  items: T[]
  nextCursor?: string
}

export interface PageListResult<T> {
  items: T[]
  hasMore: boolean
}

/** The `{ itemsPerPage, items }` envelope every Octopia list endpoint returns. */
interface OctopiaListEnvelope<T> {
  items: T[]
  itemsPerPage?: number
}

export class OctopiaClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const accessToken = credentials.accessToken
    const sellerId = credentials.extra?.['sellerId'] as string | undefined
    if (!accessToken) {
      throw new Error(
        'OctopiaClient: credentials.accessToken is required — the auth middleware should ' +
          'have called refreshCredentials before instantiating the client.',
      )
    }
    if (!sellerId) {
      throw new Error('OctopiaClient: credentials.extra.sellerId is required.')
    }
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        SellerId: sellerId,
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

  async getRaw<T>(path: string, params?: Record<string, unknown>): Promise<AxiosResponse<T>> {
    return withRetry(async () => this.http.get<T>(path, { params }))
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.patch<T>(path, body)
      return data
    })
  }

  /**
   * Cursor-paginated list (`/products`, `/seller/v2/offers`). Returns the raw
   * array plus the next page's cursor, read from the `Link` header.
   */
  async listWithCursor<T>(
    path: string,
    params: Record<string, unknown> = {},
    maxLimit: number = MAX_PRODUCT_PAGE_SIZE,
  ): Promise<CursorListResult<T>> {
    const query: Record<string, unknown> = {
      ...params,
      limit: Math.min(Number(params.limit ?? DEFAULT_PAGE_SIZE), maxLimit),
    }
    const res = await this.getRaw<OctopiaListEnvelope<T>>(path, query)
    const link = (res.headers['link'] ?? res.headers['Link']) as string | undefined
    return { items: res.data.items, nextCursor: parseNextCursor(link) }
  }

  /**
   * Offset-style list (`/orders`): `pageIndex` (1-indexed) + `pageSize`, the
   * same `{ items }` envelope as the cursor endpoints. `pageIndex` is a true
   * offset, so unlike `/products` and `/offers` no cursor needs to be
   * tracked between calls: the caller increments `pageIndex` directly and
   * `hasMore` (read from `Link`) says whether to bother.
   */
  async getPage<T>(path: string, params: Record<string, unknown> = {}): Promise<PageListResult<T>> {
    const res = await this.getRaw<OctopiaListEnvelope<T>>(path, params)
    const link = (res.headers['link'] ?? res.headers['Link']) as string | undefined
    return { items: res.data.items, hasMore: hasNextLink(link) }
  }
}
