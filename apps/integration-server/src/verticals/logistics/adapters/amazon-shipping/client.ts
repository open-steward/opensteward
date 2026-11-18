import axios, { type AxiosInstance } from 'axios'
import { AMAZON_SHIPPING_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'
const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * Amazon Shipping (SP-API) client.
 *
 * Auth: LWA access token only. As of October 2, 2023, SP-API no longer
 * requires AWS Sigv4 request signing — the LWA token in `x-amz-access-token`
 * is sufficient for all endpoints, including the Shipping API v2 used here.
 * See https://developer-docs.amazon.com/sp-api/changelog/sp-api-will-no-longer-require-aws-iam-or-aws-signature-version-4
 */
export class AmazonShippingClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: AMAZON_SHIPPING_API_BASE,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${credentials.accessToken}`,
        'x-amz-access-token': credentials.accessToken,
      },
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  async post<T>(path: string, body: unknown, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, { params })
      return data
    })
  }

  async put<T>(path: string, body: unknown, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.put<T>(path, body, { params })
      return data
    })
  }

  async delete(path: string): Promise<void> {
    return withRetry(async () => {
      await this.http.delete(path)
    })
  }
}
