/**
 * Fieldwire REST client.
 *
 * Authentication: POST {api_token} to /api_keys/jwt → short-lived Bearer JWT.
 * Pagination: cursor-based via `last_synced_at` query param + X-Last-Synced-At
 * response header. X-Has-More indicates more pages.
 * Rate limit: 429 + 5xx trigger exponential backoff.
 *
 * Docs: https://developers.fieldwire.com/docs/authentication
 *       https://developers.fieldwire.com/docs/pagination
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, JWT_ENDPOINT, API_VERSION, DEFAULT_PAGE_SIZE } from './constants'

interface JwtResponse {
  access_token: string
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

/** Exchange a long-lived API token for a short-lived JWT access token. */
async function fetchJwt(apiToken: string): Promise<string> {
  const { data } = await axios.post<JwtResponse>(
    JWT_ENDPOINT,
    { api_token: apiToken },
    {
      headers: {
        'Content-Type': 'application/json',
        'Fieldwire-Version': API_VERSION,
      },
    },
  )
  return data.access_token
}

export interface FieldwirePageResult<T> {
  items: T[]
  hasMore: boolean
  lastSyncedAt: string | undefined
}

export class FieldwireClient {
  private http!: AxiosInstance
  private apiToken: string

  constructor(credentials: Credentials) {
    // credentials.accessToken holds the raw API token provided by the user
    this.apiToken = credentials.accessToken
  }

  private async init(): Promise<void> {
    if (this.http != null) return
    const jwt = await fetchJwt(this.apiToken)
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/json',
        'Fieldwire-Version': API_VERSION,
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    await this.init()
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }

  /**
   * Paginated GET: fetches one page using Fieldwire cursor pagination.
   * Pass lastSyncedAt from a prior call to advance the cursor.
   * perPage defaults to DEFAULT_PAGE_SIZE.
   */
  async getPage<T>(
    path: string,
    lastSyncedAt?: string,
    perPage = DEFAULT_PAGE_SIZE,
  ): Promise<FieldwirePageResult<T>> {
    await this.init()
    return withRetry(async () => {
      const params: Record<string, unknown> = {}
      if (lastSyncedAt) params['last_synced_at'] = lastSyncedAt
      const { data, headers } = await this.http.get<T[]>(path, {
        params,
        headers: { 'Fieldwire-Per-Page': String(perPage) },
      })
      return {
        items: Array.isArray(data) ? data : [],
        hasMore: String(headers['x-has-more']).toLowerCase() === 'true',
        lastSyncedAt: headers['x-last-synced-at'] as string | undefined,
      }
    })
  }
}
