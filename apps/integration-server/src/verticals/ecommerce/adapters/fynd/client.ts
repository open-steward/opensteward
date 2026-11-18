/**
 * Fynd Platform API HTTP client.
 *
 * Every resource call is a plain `Authorization: Bearer <token>` request —
 * only the OAuth `authorize` redirect is signed (see `auth.ts`). Confirmed
 * from `gofynd/fdk-client-javascript` @ commit
 * `7598488bf04e7a75bc44088441745538d524abec`, `sdk/platform/PlatformAPIClient.js`
 * (`execute()` sets only `Authorization: Bearer ${token}` plus caller
 * headers — no per-request signing).
 *
 * Paths are passed in full (including module + version segment, e.g.
 * `/service/platform/catalog/v2.0/company/{id}/products/`) because this
 * adapter talks to five different Platform API modules (catalog, order,
 * cart, user, company-profile) that each version independently — there is
 * no single shared prefix worth centralising here.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { withRetry } from '@opensteward/shared'
import { FYND_DOMAIN } from './constants'

/** The `page` object every list endpoint used here returns (Catalog, Order,
 *  Cart/Coupon, User, CompanyProfile all share this exact shape). */
export interface FyndPage {
  item_total?: number
  next_id?: string
  has_previous?: boolean
  has_next?: boolean
  current?: number
  type?: string
  size?: number
  page_size?: number
}

export interface FyndListResponse<T> {
  items?: T[]
  page?: FyndPage
}

export class FyndClient {
  private http: AxiosInstance

  constructor(
    private accessToken: string,
    domain: string = FYND_DOMAIN,
  ) {
    this.http = axios.create({
      baseURL: domain,
      timeout: 30_000,
    })
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.accessToken}` }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params, headers: this.authHeaders() })
      return data
    })
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, { headers: this.authHeaders() })
      return data
    })
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.patch<T>(path, body, { headers: this.authHeaders() })
      return data
    })
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body, { headers: this.authHeaders() })
      return data
    })
  }

  async delete<T>(path: string): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.delete<T>(path, { headers: this.authHeaders() })
      return data
    })
  }
}

/** True for an axios error carrying HTTP 404 — used to translate "no such
 *  record" into the adapter's own not-found error at call sites. */
export function isNotFound(err: unknown): boolean {
  return (err as AxiosError)?.isAxiosError === true && (err as AxiosError).response?.status === 404
}
