import axios, { type AxiosInstance } from 'axios'
import { UNIFIED_TO_API_BASE } from './constants'
import { authHeader } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * Thin HTTP client for the Unified.to Shipping API.
 *
 * All shipping endpoints follow the pattern:
 *   /shipping/{connection_id}/{resource}
 *   /shipping/{connection_id}/{resource}/{id}
 *
 * The `connection_id` is read from credentials.extra.connectionId.
 * It identifies which downstream shipping provider (EasyPost, ShipStation, etc.)
 * this connection is routed to within Unified.to.
 */
export class UnifiedToShippingClient {
  private http: AxiosInstance
  readonly connectionId: string

  constructor(credentials: Credentials) {
    const connId = (credentials.extra as Record<string, unknown> | undefined)?.connectionId
    if (!connId || typeof connId !== 'string') {
      throw new Error(
        'UnifiedToShippingClient: credentials.extra.connectionId is required. ' +
          'Supply the Unified.to connection ID when creating credentials.',
      )
    }
    this.connectionId = connId
    this.http = axios.create({
      baseURL: UNIFIED_TO_API_BASE,
      headers: {
        Authorization: authHeader(credentials.accessToken),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  /** Build the base path for a resource under the current connection. */
  private resourcePath(resource: string): string {
    return `/shipping/${this.connectionId}/${resource}`
  }

  async get<T>(resource: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(this.resourcePath(resource), { params })
      return data
    })
  }

  async getById<T>(resource: string, id: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(`${this.resourcePath(resource)}/${id}`, { params })
      return data
    })
  }

  async post<T>(resource: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(this.resourcePath(resource), body)
      return data
    })
  }

  async patch<T>(resource: string, id: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.patch<T>(`${this.resourcePath(resource)}/${id}`, body)
      return data
    })
  }

  async delete(resource: string, id: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(`${this.resourcePath(resource)}/${id}`)
    })
  }
}
