/**
 * ONES REST client.
 *
 * All ONES OpenAPI v2 requests require:
 *   Authorization: Bearer <access_token>
 *   teamID query parameter (required for every resource endpoint)
 *
 * List endpoints return:
 *   { result, data: { list: [...], pageInfo: { endCursor, hasNextPage, ... } } }
 *
 * Single-object endpoints return:
 *   { result, data: { ... } }
 *
 * Docs: https://docs.ones.com/developer/openapi/authorization
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { apiBaseUrl } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if (
        (status === 429 || (status !== undefined && status >= 500 && status < 600)) &&
        i < retries
      ) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/**
 * ONES cursor-based page info returned on every list response.
 */
export interface OnesPageInfo {
  count?: number
  startCursor?: string
  endCursor?: string
  hasNextPage?: boolean
  totalCount?: number
}

export interface OnesListEnvelope<T> {
  result?: string
  data?: {
    list?: T[]
    pageInfo?: OnesPageInfo
  }
}

export interface OnesGetEnvelope<T> {
  result?: string
  data?: T
}

export class OnesClient {
  private http: AxiosInstance

  constructor(domain: string, credentials: Credentials) {
    this.http = axios.create({
      baseURL: apiBaseUrl(domain),
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
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

  /** One page of a ONES cursor list: its rows and `pageInfo`. */
  async getPage<T>(
    path: string,
    params?: Record<string, unknown>,
  ): Promise<{ items: T[]; pageInfo: OnesPageInfo }> {
    const res = await this.get<OnesListEnvelope<T>>(path, params)
    return { items: res.data?.list ?? [], pageInfo: res.data?.pageInfo ?? {} }
  }

  /** Unwraps a ONES `{ data }` single-object envelope. */
  async getOne<T>(path: string, params?: Record<string, unknown>): Promise<T | undefined> {
    const res = await this.get<OnesGetEnvelope<T>>(path, params)
    return res.data
  }
}
