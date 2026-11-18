/**
 * Southeastern Freight Lines – HTTP client.
 *
 * Wraps axios with:
 *  - Automatic `Authorization: Basic …` header injection
 *  - `shipper_account` header for all pickup-API requests
 *  - Retry on transient errors
 */

import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios'
import { withRetry as withRetryBase } from '@opensteward/shared'
import type { Credentials } from '../../adapter/interface'
import { basicAuthHeader, shipperAccountHeader } from './auth'
import { SEFL_PICKUP_BASE, SEFL_WEBCONNECT_BASE, SEFL_RESOURCES_BASE, SEFL_DOC_RETRIEVAL_BASE } from './constants'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * Pre-configured axios instances for each SEFL API surface.
 * The pickup API requires `shipper_account`; the webconnect endpoints do not.
 */
export class SeflClient {
  private pickupHttp: AxiosInstance
  private webconnectHttp: AxiosInstance
  private resourcesHttp: AxiosInstance
  private documentHttp: AxiosInstance

  constructor(credentials: Credentials) {
    const authHeader = basicAuthHeader(credentials.accessToken)
    const accountHeader = shipperAccountHeader(credentials)

    this.pickupHttp = axios.create({
      baseURL: SEFL_PICKUP_BASE,
      headers: {
        Authorization: authHeader,
        shipper_account: accountHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })

    this.webconnectHttp = axios.create({
      baseURL: SEFL_WEBCONNECT_BASE,
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
      },
    })

    this.resourcesHttp = axios.create({
      baseURL: SEFL_RESOURCES_BASE,
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
      },
    })

    this.documentHttp = axios.create({
      baseURL: SEFL_DOC_RETRIEVAL_BASE,
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  // ── Pickup API ─────────────────────────────────────────────────────────────

  async pickupPost<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.pickupHttp.post<T>(path, body)
      return data
    })
  }

  async pickupGet<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.pickupHttp.get<T>(path, { params } as AxiosRequestConfig)
      return data
    })
  }

  // ── WebConnect API ─────────────────────────────────────────────────────────

  async webconnectGet<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.webconnectHttp.get<T>(path, { params } as AxiosRequestConfig)
      return data
    })
  }

  async webconnectPost<T>(path: string, form: URLSearchParams): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.webconnectHttp.post<T>(path, form.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      return data
    })
  }

  // ── Resources API ──────────────────────────────────────────────────────────

  async resourcesGet<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.resourcesHttp.get<T>(path, { params } as AxiosRequestConfig)
      return data
    })
  }

  // ── Document Retrieval API ─────────────────────────────────────────────────

  async documentPost<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.documentHttp.post<T>(path, body)
      return data
    })
  }
}
