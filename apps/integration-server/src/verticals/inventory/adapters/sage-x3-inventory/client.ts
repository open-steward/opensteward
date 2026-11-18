/**
 * Sage X3 REST API client.
 *
 * URL structure:  <serverUrl>/<folder>/<CLASS>?representation=<REPR>.<FACET>&count=N&$startIndex=N
 *
 * Example:
 *   GET https://tenant.online.sage.com/api1/x3/erp/SEED/ITMMASTER
 *       ?representation=ITMMASTER.$query&count=100
 *
 * Auth:      Bearer <accessToken>
 * Pagination: count (page size), $startIndex (0-based offset)
 *             Response envelope: { $totalResults, $itemsPerPage, $resources: [...] }
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_PAGE_SIZE, FACET } from './constants'

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

/** SData 2.0 query response envelope returned by Sage X3 api1 endpoints */
export interface SageX3QueryResponse<T> {
  $totalResults?: number
  $itemsPerPage?: number
  $startIndex?: number
  $resources?: T[]
}

/** SData 2.0 single-record response (details facet returns the record directly) */
export type SageX3DetailsResponse<T> = T

export class SageX3Client {
  private http: AxiosInstance
  private folder: string

  constructor(credentials: Credentials) {
    const serverUrl = String(credentials.extra?.['serverUrl'] ?? '').replace(/\/$/, '')
    this.folder = String(credentials.extra?.['folder'] ?? '')

    this.http = axios.create({
      baseURL: serverUrl,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * Execute a paginated $query request.
   *
   * @param className  Sage X3 class name, e.g. 'ITMMASTER'
   * @param params     Optional extra query params (where, orderBy, etc.)
   * @param pageSize   Number of records per page
   * @param startIndex 0-based start index
   */
  async query<T>(
    className: string,
    params: Record<string, unknown> = {},
    pageSize: number = DEFAULT_PAGE_SIZE,
    startIndex: number = 0,
  ): Promise<SageX3QueryResponse<T>> {
    return withRetry(async () => {
      const { data } = await this.http.get<SageX3QueryResponse<T>>(
        `/${this.folder}/${className}`,
        {
          params: {
            representation: `${className}.${FACET.QUERY}`,
            count: pageSize,
            $startIndex: startIndex,
            ...params,
          },
        },
      )
      return data
    })
  }

  /**
   * Fetch a single record by key using the $details facet.
   *
   * @param className  Sage X3 class name
   * @param key        Record key (single-part key as string, e.g. 'PROD001')
   * @param params     Optional extra query params
   */
  async details<T>(
    className: string,
    key: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(
        `/${this.folder}/${className}('${encodeURIComponent(key)}')`,
        {
          params: {
            representation: `${className}.${FACET.DETAILS}`,
            ...params,
          },
        },
      )
      return data
    })
  }
}
