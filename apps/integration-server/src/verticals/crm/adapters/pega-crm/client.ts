/**
 * Pega CRM HTTP client.
 *
 * Pega exposes CRM data through:
 *   - GET /prweb/api/v1/data/{DataPageName}  (list / detail data pages)
 *   - GET/POST/PUT /prweb/api/v1/cases       (cases — opportunities, activities)
 *
 * Pagination for data pages uses `pageNumber` (1-based) and `pageSize` query
 * parameters. Responses wrap results in a `pxResults` array and include
 * `pyPageCount` for total-page detection.
 *
 * All requests are authenticated with `Authorization: Bearer {accessToken}`.
 * The tenant base URL is stored in `credentials.extra.baseUrl` after the
 * OAuth2 code exchange; the adapter falls back to a required constructor param.
 */

import type { Credentials } from '@opensteward/shared'
import { PEGA_API_PATH, PEGA_DEFAULT_PAGE_SIZE } from './constants'

/**
 * Pega data-page list response.
 * Results are under the `pxResults` key; paging info is in `pyRuleSet`.
 */
interface PegaDataPageResponse<T> {
  pxResults?: T[]
  pyPageCount?: number
  pyRuleSet?: Record<string, unknown>
  [key: string]: unknown
}

/**
 * Pega cases list response from GET /prweb/api/v1/cases.
 */
interface PegaCasesResponse<T> {
  cases?: T[]
  nextPageToken?: string
  [key: string]: unknown
}

async function request<T>(
  method: string,
  url: string,
  credentials: Credentials,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<T> {
  const fullUrl = new URL(url)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        fullUrl.searchParams.set(k, String(v))
      }
    }
  }

  const res = await fetch(fullUrl.toString(), {
    method,
    headers: {
      'Authorization': `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`Pega CRM API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  // 204 No Content on DELETE
  if (res.status === 204) return undefined as unknown as T

  return res.json() as Promise<T>
}

export class PegaCrmClient {
  private baseUrl: string

  constructor(
    private credentials: Credentials,
    /** Tenant base URL — taken from credentials.extra.baseUrl when not supplied. */
    baseUrl?: string,
  ) {
    const extra = credentials.extra as Record<string, unknown> | undefined
    this.baseUrl = (baseUrl ?? extra?.['baseUrl'] as string | undefined ?? '').replace(/\/$/, '')
    if (!this.baseUrl) {
      throw new Error('Pega CRM: baseUrl is required. Set it in PegaCrmAdapterConfig or via credentials.extra.baseUrl.')
    }
  }

  private apiUrl(path: string): string {
    return `${this.baseUrl}${PEGA_API_PATH}${path}`
  }

  /**
   * Fetch a Pega data page (list).
   *
   * @param dataPageName  e.g. D_crmContactList
   * @param pageNumber    1-based page number
   * @param pageSize      records per page
   * @param extraParams   additional filter params passed as query strings
   */
  async listDataPage<T>(
    dataPageName: string,
    pageNumber = 1,
    pageSize = PEGA_DEFAULT_PAGE_SIZE,
    extraParams: Record<string, unknown> = {},
  ): Promise<{ items: T[]; hasMore: boolean }> {
    const res = await request<PegaDataPageResponse<T>>(
      'GET',
      this.apiUrl(`/data/${dataPageName}`),
      this.credentials,
      { pageNumber, pageSize, ...extraParams },
    )
    const items = res.pxResults ?? []
    const totalPages = res.pyPageCount ?? 1
    return {
      items,
      hasMore: pageNumber < totalPages,
    }
  }

  /**
   * Fetch a single Pega data page (detail).
   *
   * @param dataPageName  e.g. D_crmContact
   * @param params        page parameters (e.g. { pyGUID: '...' })
   */
  async getDataPage<T>(
    dataPageName: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    return request<T>(
      'GET',
      this.apiUrl(`/data/${dataPageName}`),
      this.credentials,
      params,
    )
  }

  /**
   * Fetch a list of cases from /prweb/api/v1/cases.
   *
   * @param params  Query parameters (e.g. caseTypeID, pageNumber, pageSize)
   */
  async listCases<T>(
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[]; hasMore: boolean }> {
    const res = await request<PegaCasesResponse<T>>(
      'GET',
      this.apiUrl('/cases'),
      this.credentials,
      params,
    )
    const items = res.cases ?? []
    return {
      items,
      hasMore: res.nextPageToken != null,
    }
  }

  /**
   * Fetch a single case by ID.
   */
  async getCase<T>(caseId: string): Promise<T> {
    return request<T>(
      'GET',
      this.apiUrl(`/cases/${encodeURIComponent(caseId)}`),
      this.credentials,
    )
  }

  /**
   * Create a new case.
   */
  async createCase<T>(body: unknown): Promise<T> {
    return request<T>(
      'POST',
      this.apiUrl('/cases'),
      this.credentials,
      undefined,
      body,
    )
  }

  /**
   * Update an existing case by ID.
   */
  async updateCase<T>(caseId: string, body: unknown): Promise<T> {
    return request<T>(
      'PUT',
      this.apiUrl(`/cases/${encodeURIComponent(caseId)}`),
      this.credentials,
      undefined,
      body,
    )
  }
}
