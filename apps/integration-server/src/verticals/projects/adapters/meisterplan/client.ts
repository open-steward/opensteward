import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL_DEFAULT, API_BASE_URL_EU, API_BASE_URL_US } from './constants'

/**
 * Meisterplan REST client.
 *
 * Authentication: the API token (including its `api-` prefix) is sent as the
 * raw value of the `Authorization` header — no `Bearer` wrapper.
 *   Authorization: api-48eba51e5a8d43ed8a8daeba585b7093
 *
 * Region: stored in `credentials.extra.region` as `"us"` or `"eu"`.  Defaults
 * to US when absent.
 *
 * Pagination: cursor-based.  List endpoints accept `pageSize` + `pageAfter`
 * (opaque cursor); the response carries `_pagination.after.cursor` for the
 * next page.
 *
 * Rate limit: ≥300 req/min per user; HTTP 429 → exponential back-off.
 * Docs: https://api.us.meisterplan.com/docs/api.html
 */

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
  const region = credentials.extra?.['region']
  if (region === 'eu') return API_BASE_URL_EU
  if (region === 'us') return API_BASE_URL_US
  return API_BASE_URL_DEFAULT
}

export class MeisterplanClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const apiToken = (credentials.accessToken ?? '').trim()
    if (!apiToken) {
      throw new Error('Meisterplan connection is missing the API token.')
    }
    this.http = axios.create({
      baseURL: resolveBaseUrl(credentials),
      headers: {
        // The token includes the `api-` prefix — send it verbatim.
        Authorization: apiToken,
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

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(path, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    })
  }
}
