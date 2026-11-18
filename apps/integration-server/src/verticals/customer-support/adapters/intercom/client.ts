import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URLS, API_VERSION, type IntercomRegion } from './constants'
import { normaliseRegion } from './auth'

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
 * The workspace's region, from `credentials.extra.region` (written at token
 * exchange). A connection made before the region was collected has none; it
 * was always served from `https://api.intercom.io`, the US host, so it stays
 * there. A region that is present but not us/eu/au throws.
 */
export function regionOf(credentials: Credentials): IntercomRegion {
  const raw = credentials.extra?.['region']
  return raw === undefined || raw === null || raw === '' ? 'us' : normaliseRegion(raw)
}

export class IntercomClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URLS[regionOf(credentials)],
      headers: {
        // "provide it as an Authorization:Bearer header in your requests"
        // https://developers.intercom.com/docs/build-an-integration/learn-more/authentication
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
        'Intercom-Version': API_VERSION,
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
