/**
 * Jira Service Management HTTP client.
 *
 * Wraps both the Service Desk API and the Jira Platform v3 API.
 * The cloudId is resolved from credentials.extra.cloudId after OAuth exchange.
 *
 * Pagination: JSM uses ?start=<offset>&limit=<n>; responses contain
 * { values: T[], isLastPage: bool, start: n, limit: n, size: n }.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { SERVICEDESK_API_TEMPLATE, JIRA_API_TEMPLATE, DEFAULT_PAGE_SIZE } from './constants'

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

export interface JsmPagedResponse<T> {
  values: T[]
  isLastPage: boolean
  start: number
  limit: number
  size: number
}

export class JiraServiceManagementClient {
  private sdApi: AxiosInstance
  private jiraApi: AxiosInstance

  constructor(credentials: Credentials) {
    const cloudId = String(credentials.extra?.['cloudId'] ?? '')
    if (!cloudId) {
      throw new Error(
        'jira-service-management requires credentials.extra.cloudId (set after OAuth exchange)',
      )
    }

    const sdBaseURL = SERVICEDESK_API_TEMPLATE.replace('{cloudId}', cloudId)
    const jiraBaseURL = JIRA_API_TEMPLATE.replace('{cloudId}', cloudId)
    const headers = {
      Authorization: `Bearer ${credentials.accessToken}`,
      Accept: 'application/json',
    }

    this.sdApi = axios.create({ baseURL: sdBaseURL, headers, timeout: 30_000 })
    this.jiraApi = axios.create({ baseURL: jiraBaseURL, headers, timeout: 30_000 })
  }

  /** GET against the Service Desk API. */
  async sdGet<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.sdApi.get<T>(path, { params })
      return data
    })
  }

  /** GET against the Jira Platform v3 API. */
  async jiraGet<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.jiraApi.get<T>(path, { params })
      return data
    })
  }

  /**
   * Convenience: fetch all values from a paged JSM endpoint by following
   * start/limit pages.  Stops when isLastPage is true or values is empty.
   */
  async sdGetAll<T>(
    path: string,
    params: Record<string, unknown> = {},
    maxItems = DEFAULT_PAGE_SIZE,
  ): Promise<T[]> {
    const results: T[] = []
    let start = 0
    const limit = Math.min(maxItems, DEFAULT_PAGE_SIZE)
    while (true) {
      const page = await this.sdGet<JsmPagedResponse<T>>(path, { ...params, start, limit })
      results.push(...(page.values ?? []))
      if (page.isLastPage || results.length >= maxItems) break
      start += page.limit
    }
    return results.slice(0, maxItems)
  }
}
