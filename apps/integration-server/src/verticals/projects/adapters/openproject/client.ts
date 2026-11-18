import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_PATH_PREFIX } from './constants'

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
 * Collection envelope for OpenProject HAL+JSON list endpoints. Elements live
 * under `_embedded.elements`; pagination is offset-based (1-based page index
 * via `offset`, size via `pageSize`).
 */
export interface HalCollection<T> {
  _type?: string
  total?: number
  count?: number
  pageSize?: number
  offset?: number
  _embedded?: { elements?: T[] }
  _links?: {
    self?: { href?: string }
    nextByOffset?: { href?: string } | null
    prevByOffset?: { href?: string } | null
  }
}

/**
 * Resolve the instance origin for a connection. OpenProject is per-tenant, so
 * the origin is captured at OAuth time in `credentials.extra.instanceUrl`. A
 * deployment-level default can also be supplied to the constructor.
 */
function resolveBaseUrl(credentials: Credentials, fallbackInstanceUrl?: string): string {
  const fromCreds =
    typeof credentials.extra?.['instanceUrl'] === 'string'
      ? (credentials.extra['instanceUrl'] as string)
      : undefined
  const instance = (fromCreds ?? fallbackInstanceUrl ?? '').replace(/\/+$/, '')
  if (!instance) {
    throw new Error('OpenProject instance URL is not configured for this connection')
  }
  return `${instance}${API_PATH_PREFIX}`
}

export class OpenProjectClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, fallbackInstanceUrl?: string) {
    this.http = axios.create({
      baseURL: resolveBaseUrl(credentials, fallbackInstanceUrl),
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/hal+json',
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

  /** One page of an offset-paginated collection, with its `total` and `pageSize`. */
  async getCollectionPage<T>(
    path: string,
    params: { offset: number; pageSize: number },
  ): Promise<HalCollection<T>> {
    return this.get<HalCollection<T>>(path, params)
  }

  async getCollection<T>(
    path: string,
    params?: Record<string, unknown>,
  ): Promise<T[]> {
    const data = await this.get<HalCollection<T>>(path, params)
    return data._embedded?.elements ?? []
  }
}
