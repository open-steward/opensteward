/**
 * Channel Talk HTTP client.
 *
 * Auth: dual-key scheme — every request carries:
 *   x-access-key:    credentials.accessToken   (the Access Key)
 *   x-access-secret: credentials.extra.accessSecret
 *
 * Version: every request also carries a pinned `Channel-Version` header
 * (see constants.ts) — the current unversioned `/open/*` API selects a
 * version by header, not by path segment.
 *
 * Pagination: cursor-based via `cursor` query param + `nextCursor`/`hasNext`
 * in the response root.
 * Rate limit: HTTP 429 → exponential back-off (same as other adapters).
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, CHANNEL_API_VERSION } from './constants'

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

export class ChannelTalkClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    const accessKey = credentials.accessToken
    const accessSecret = String(credentials.extra?.['accessSecret'] ?? '')
    if (!accessKey) throw new Error('channel-talk requires credentials.accessToken (Access Key)')
    if (!accessSecret) throw new Error('channel-talk requires credentials.extra.accessSecret')

    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'x-access-key': accessKey,
        'x-access-secret': accessSecret,
        Accept: 'application/json',
        'Channel-Version': CHANNEL_API_VERSION,
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
