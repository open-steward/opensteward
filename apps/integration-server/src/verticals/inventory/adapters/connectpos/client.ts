import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { XREST_PATH } from './constants'

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

/**
 * ConnectPOS REST client.
 *
 * All requests go to {storeUrl}/xrest/index/v1?path={resource} with Bearer
 * JWT in the Authorization header. Pagination uses Magento-style searchCriteria
 * query params: searchCriteria[currentPage] and searchCriteria[pageSize].
 */
export class ConnectposClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const storeUrl = String(credentials.extra?.['storeUrl'] ?? '').replace(/\/+$/, '')
    if (!storeUrl) throw new Error('connectpos requires credentials.extra.storeUrl')
    this.http = axios.create({
      baseURL: `${storeUrl}${XREST_PATH}`,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * GET /xrest/index/v1?path={resource}&searchCriteria[...]
   */
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>('', { params: { path, ...params } })
      return data
    })
  }
}
