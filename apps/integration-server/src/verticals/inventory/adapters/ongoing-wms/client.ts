/**
 * Ongoing WMS HTTP client.
 *
 * Auth: HTTP Basic via Authorization header (Base64 username:password).
 * Base URL: https://api.ongoingsystems.se/{warehouse}/api/v1/
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL_TEMPLATE } from './constants'

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

export class OngoingWmsClient {
  private http: AxiosInstance
  readonly goodsOwnerId: number

  constructor(credentials: Credentials) {
    const username = credentials.accessToken
    const password = String(credentials.extra?.['password'] ?? '')
    const warehouse = String(credentials.extra?.['warehouse'] ?? '')
    const goodsOwnerIdRaw = credentials.extra?.['goodsOwnerId']

    if (!username || !password) throw new Error('ongoing-wms requires username and password')
    if (!warehouse) throw new Error('ongoing-wms requires credentials.extra.warehouse')
    if (!goodsOwnerIdRaw) throw new Error('ongoing-wms requires credentials.extra.goodsOwnerId')

    this.goodsOwnerId = Number(goodsOwnerIdRaw)
    if (!Number.isFinite(this.goodsOwnerId)) {
      throw new Error(`ongoing-wms goodsOwnerId must be an integer, got: ${goodsOwnerIdRaw}`)
    }

    const baseURL = API_BASE_URL_TEMPLATE.replace('{warehouse}', warehouse)
    const token = Buffer.from(`${username}:${password}`).toString('base64')

    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Basic ${token}`,
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
}
