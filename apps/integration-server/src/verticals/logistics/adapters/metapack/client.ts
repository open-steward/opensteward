import axios, { type AxiosInstance } from 'axios'
import {
  METAPACK_SHIPPING_API_BASE,
  METAPACK_SHIPPING_API_BASE_SANDBOX,
  METAPACK_TRACKING_API_BASE,
  METAPACK_TRACKING_API_BASE_SANDBOX,
} from './constants'
import { authHeader } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'
const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/** Which Metapack API a request goes to: the Shipping API or the Tracking API. */
export type MetapackApi = 'shipping' | 'tracking'

export function metapackBaseUrl(api: MetapackApi, sandbox: boolean): string {
  if (api === 'tracking') {
    return sandbox ? METAPACK_TRACKING_API_BASE_SANDBOX : METAPACK_TRACKING_API_BASE
  }
  return sandbox ? METAPACK_SHIPPING_API_BASE_SANDBOX : METAPACK_SHIPPING_API_BASE
}

export class MetapackClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, api: MetapackApi = 'shipping', sandbox = false) {
    this.http = axios.create({
      baseURL: metapackBaseUrl(api, sandbox),
      headers: {
        Authorization: authHeader(credentials),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, params ? { params } : undefined)
      return data
    })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }
}
