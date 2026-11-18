/**
 * OTTO Market Partner API HTTP client.
 *
 * Auth: `Authorization: Bearer <accessToken>`.
 * Every list endpoint shares one hypermedia envelope, per
 * https://api.otto.market/docs/about-the-api/api-guides ("Global Pagination
 * Convention") and confirmed again per-family (Orders, Shipments, Receipts,
 * Availability):
 *
 *   { "resources": [ ... ], "links": [ { "rel": "next", "href": "..." } ] }
 *
 * No `rel: "next"` entry means the list has ended. Because the `next` link
 * is a complete relative URL (path + query string already filled in), this
 * client never needs to know a family's cursor-param name (`next`,
 * `nextcursor`, ...) — it just re-requests the href verbatim.
 */

import axios, { type AxiosInstance } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { withRetry } from '@opensteward/shared'
import { baseUrlFor } from './auth'

export interface OttoLink {
  rel: string
  href: string
}

export interface OttoListEnvelope<T> {
  resources?: T[]
  links?: OttoLink[]
}

export interface OttoListPage<T> {
  items: T[]
  /** The `next` link's href, verbatim — pass it straight back into `get`. */
  nextHref?: string
}

export class OttoMarketClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    if (!credentials.accessToken) {
      throw new Error(
        'OttoMarketClient: credentials.accessToken is required — the auth middleware ' +
          'should have called refreshCredentials before instantiating the client.',
      )
    }
    const environment = credentials.extra?.['environment'] as string | undefined
    this.http = axios.create({
      baseURL: baseUrlFor(environment),
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(pathOrHref: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(pathOrHref, { params })
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

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }

  /**
   * One page of a `{ resources, links }` list. `cursorHref`, when given, IS
   * the whole next request — `path`/`params` are only for page 1.
   */
  async listPage<T>(
    path: string,
    params: Record<string, unknown>,
    cursorHref?: string,
  ): Promise<OttoListPage<T>> {
    const res = await (cursorHref
      ? this.get<OttoListEnvelope<T>>(cursorHref)
      : this.get<OttoListEnvelope<T>>(path, params))
    const nextHref = res.links?.find((l) => l.rel === 'next')?.href
    return { items: res.resources ?? [], nextHref }
  }
}
