/**
 * Wasp InventoryCloud HTTP client.
 *
 * Base URL is tenant-specific: https://{tenant}.waspinventorycloud.com/public-api
 * All API calls are POST with JSON body.
 * Auth: Bearer token (API key) in Authorization header.
 * Rate limit: 200 requests/minute — 429 responses trigger exponential backoff.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_PATH } from './constants'

function buildBaseUrl(credentials: Credentials): string {
  const tenant = (credentials.extra as Record<string, string> | undefined)?.['tenant'] ?? ''
  if (!tenant) throw new Error('wasp-barcode: missing tenant in credentials.extra')
  return `https://${tenant}.waspinventorycloud.com${API_BASE_PATH}`
}

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

export class WaspBarcodeClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: buildBaseUrl(credentials),
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * All InventoryCloud public API endpoints are POST.
   * The path should NOT include the /public-api prefix (already in baseURL).
   */
  async post<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body)
      return data
    })
  }
}
