import axios, { type AxiosInstance } from 'axios'
import { UPS_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { randomUUID } from 'crypto'
import { withRetry as withRetryBase } from '@opensteward/shared'
const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

export class UPSClient {
  private http: AxiosInstance
  private transactionSrc: string

  constructor(credentials: Credentials, transactionSrc = 'open-logistics-integration') {
    const baseUrl = (credentials.extra as Record<string, string> | undefined)?.baseUrl ?? UPS_API_BASE

    this.transactionSrc = transactionSrc
    this.http = axios.create({
      baseURL: baseUrl,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  /**
   * Transaction headers plus any the caller adds. The Pickup API addresses
   * resources through headers rather than the path or body — `Prn` on cancel,
   * `AccountNumber` on pending-status — which is why every verb takes an
   * optional header bag. Auth headers live on the axios instance and merge
   * underneath these.
   */
  private transHeaders(extra?: Record<string, string>): Record<string, string> {
    return {
      transId: randomUUID(),
      transactionSrc: this.transactionSrc,
      ...extra,
    }
  }

  async get<T>(
    path: string,
    params?: Record<string, unknown>,
    headers?: Record<string, string>,
  ): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        params,
        headers: this.transHeaders(headers),
      })
      return data
    })
  }

  async post<T>(path: string, body: unknown, headers?: Record<string, string>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        headers: this.transHeaders(headers),
      })
      return data
    })
  }

  async delete<T>(path: string, headers?: Record<string, string>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.delete<T>(path, {
        headers: this.transHeaders(headers),
      })
      return data
    })
  }
}
