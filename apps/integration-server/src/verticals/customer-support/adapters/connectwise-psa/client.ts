/**
 * ConnectWise PSA REST client.
 *
 * Auth headers:
 *   Authorization: Basic {base64(companyId+publicKey:privateKey)}  (stored in credentials.accessToken)
 *   clientId:      {clientId}                                       (from credentials.extra.clientId)
 *
 * Base URL resolution (in order):
 *   1. credentials.extra.siteUrl  — per-tenant on-premise or regional cloud override
 *   2. DEFAULT_CLOUD_BASE_URL     — https://api-na.myconnectwise.net
 *
 * Pagination: page + pageSize query parameters (page 1-indexed). The public
 * swagger documents no maximum pageSize; the next page is signalled by rel="next"
 * in the Link response header.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_CLOUD_BASE_URL, API_ENTRY_POINT } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      if ((status === 429 || (status !== undefined && status >= 500 && status < 600)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

function resolveBaseUrl(credentials: Credentials): string {
  const siteUrl = credentials.extra?.['siteUrl']
  if (typeof siteUrl === 'string' && siteUrl.length > 0) {
    return siteUrl.replace(/\/$/, '')
  }
  return DEFAULT_CLOUD_BASE_URL
}

export class ConnectWisePsaClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const baseURL = `${resolveBaseUrl(credentials)}${API_ENTRY_POINT}`
    const clientId = String(credentials.extra?.['clientId'] ?? '')

    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Basic ${credentials.accessToken}`,
        clientId,
        Accept: 'application/json',
        'Content-Type': 'application/json',
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

  /**
   * One page of a list endpoint, with its `Link` response header ("Pagination
   * header; potentially includes first, prev, next, and/or last.").
   */
  async getPage<T>(path: string, params: Record<string, unknown>): Promise<{ data: T; link: string | undefined }> {
    return withRetry(async () => {
      const res = await this.http.get<T>(path, { params })
      const link = (res.headers as Record<string, unknown> | undefined)?.['link']
      return { data: res.data, link: typeof link === 'string' ? link : undefined }
    })
  }
}
