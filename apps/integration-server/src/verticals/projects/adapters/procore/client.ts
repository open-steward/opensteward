import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

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

export interface PagedResult<T> {
  /** The decoded JSON array body. */
  data: T[]
  /** `page` number for the next page, derived from the `Link` header. */
  nextPage?: number
  /** The `Total` response header: rows matching the query across all pages. */
  total?: number
}

function parseTotal(header: unknown): number | undefined {
  if (header == null || header === '') return undefined
  const n = Number(header)
  return Number.isInteger(n) && n >= 0 ? n : undefined
}

function parseNextPage(linkHeader: unknown): number | undefined {
  if (typeof linkHeader !== 'string' || linkHeader.length === 0) return undefined
  // Procore Link header: <https://api.procore.com/...?page=4&per_page=5>; rel="next"
  for (const part of linkHeader.split(',')) {
    if (!/rel="?next"?/.test(part)) continue
    const url = part.match(/<([^>]+)>/)?.[1]
    if (!url) continue
    const page = new URL(url).searchParams.get('page')
    if (page) {
      const n = Number(page)
      if (!Number.isNaN(n)) return n
    }
  }
  return undefined
}

/**
 * Thin Procore REST client. Procore returns resource collections as a bare
 * JSON array (not wrapped) and surfaces pagination through the `Link` /
 * `Total` / `Per-Page` response headers. The Bearer access token authorizes
 * every request.
 *
 * `companyId` is sent as the `Procore-Company-Id` header: "Each call your
 * application makes to the Procore API must contain a request header that
 * includes the `Procore-Company-Id` field. This request header field specifies
 * the id of the company into which you are making the call." Only List
 * Companies (`GET /rest/v1.0/companies`) and Show User Info are exempt
 * (https://developers.procore.com/documentation/tutorial-mpz).
 */
export class ProcoreClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, companyId?: string) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
        ...(companyId !== undefined ? { 'Procore-Company-Id': companyId } : {}),
      },
      timeout: 30_000,
    })
  }

  /** GET a collection endpoint, returning the array body + next-page hint. */
  async list<T>(path: string, params?: Record<string, unknown>): Promise<PagedResult<T>> {
    return withRetry(async () => {
      const res = await this.http.get<T[]>(path, { params })
      return {
        data: Array.isArray(res.data) ? res.data : [],
        nextPage: parseNextPage(res.headers['link']),
        total: parseTotal(res.headers['total']),
      }
    })
  }

  /** GET a single-resource endpoint, returning the decoded object. */
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, { params })
      return data
    })
  }
}
