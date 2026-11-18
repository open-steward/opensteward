import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import {
  PRODUCTION_QUERY_BASE_URL,
  PRODUCTION_TRANSACTION_BASE_URL,
  SANDBOX_QUERY_BASE_URL,
  SANDBOX_TRANSACTION_BASE_URL,
} from './constants'
import { environmentFrom, merchantIdFrom, merchantKeyFrom } from './auth'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const s = (err as AxiosError).response?.status
      if ((s === 429 || (s !== undefined && s >= 500)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/**
 * Cielo splits writes and reads across two hosts. Both share the same
 * MerchantId / MerchantKey header pair, so we build one Axios instance per
 * host and route each call to the right one.
 *
 * Cielo exposes no list/cursor surface; every read is a point lookup by
 * PaymentId, so the client has no pagination helper.
 */
export class CieloClient {
  private transactionHttp: AxiosInstance
  private queryHttp: AxiosInstance

  constructor(credentials: Credentials) {
    const isProd = environmentFrom(credentials) === 'production'
    const headers = {
      MerchantId: merchantIdFrom(credentials),
      MerchantKey: merchantKeyFrom(credentials),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }
    this.transactionHttp = axios.create({
      baseURL: isProd ? PRODUCTION_TRANSACTION_BASE_URL : SANDBOX_TRANSACTION_BASE_URL,
      headers,
      timeout: 30_000,
    })
    this.queryHttp = axios.create({
      baseURL: isProd ? PRODUCTION_QUERY_BASE_URL : SANDBOX_QUERY_BASE_URL,
      headers,
      timeout: 30_000,
    })
  }

  /** Read (query host): query sale, query BIN. */
  async query<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => (await this.queryHttp.get<T>(path, { params })).data)
  }

  /** Write — create sale (transactional host). */
  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => (await this.transactionHttp.post<T>(path, body)).data)
  }

  /** Write — capture / void (transactional host, PUT with no body). */
  async put<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => (await this.transactionHttp.put<T>(path, undefined, { params })).data)
  }
}
