/**
 * HTTP client for the Ramp Developer API v1.
 *
 * Base URL: https://api.ramp.com/developer/v1/
 * Auth:     Authorization: Bearer <access_token>
 * Pagination: keyset. The first page is the list path with `page_size`
 *             (2-100) and its filters; every later page is the complete URL
 *             the previous response returned in `page.next`, which carries the
 *             `start` cursor and "preserves the other query parameters
 *             required for the current result set"
 *             (https://docs.ramp.com/llms-guides/pagination.txt). `page.next`
 *             is null on the last page.
 */

import axios, { type AxiosInstance } from 'axios'
import { RAMP_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

/** Ramp paginated list response envelope */
export interface RampPage<T> {
  data: T[]
  page: {
    /** The complete URL of the next page (`<BASE_URL>?<new_params>`); null on the last page. */
    next: string | null
  }
}

const API = new URL(RAMP_API_BASE)

/**
 * The `page.next` URL as a request target. Ramp: "Use the complete URL in the
 * next field to request the next page. ... Treat the cursor as opaque instead
 * of constructing or changing it yourself." So it is requested as given, never
 * taken apart. It must stay on the API's origin and under its base path: the
 * request carries this connection's bearer token, which goes nowhere a
 * response merely names.
 */
export function nextPageUrl(next: string): string {
  let url: URL
  try {
    url = new URL(next, API)
  } catch {
    throw new Error('Ramp returned a page.next that is not a URL')
  }
  if (url.origin !== API.origin || !url.pathname.startsWith(API.pathname)) {
    throw new Error(
      `Ramp returned a page.next outside ${RAMP_API_BASE} (${url.origin}); not sending this connection's token to it`,
    )
  }
  return url.href
}

export class RampClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: RAMP_API_BASE,
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

  async patch<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.patch<T>(path, body)
      return data
    })
  }

  /**
   * One page of a list, as the raw envelope. Without `next` it is the first
   * page: `path` with `page_size` (the caller clamps it to 2-100) and the
   * filters. With `next`, the `page.next` URL the previous page returned is
   * requested as it stands, and `path`, `params` and `pageSize` are not sent:
   * that URL already carries them.
   */
  async list<T>(
    path: string,
    params: Record<string, unknown>,
    pageSize: number,
    next?: string,
  ): Promise<RampPage<T>> {
    if (next) return this.get<RampPage<T>>(nextPageUrl(next))
    return this.get<RampPage<T>>(path, { ...params, page_size: pageSize })
  }
}
