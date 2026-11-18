/**
 * HTTP client for the NetSuite SuiteProjects Pro REST API.
 *
 * Base URL is account-specific:
 *   https://<company-id>.app.netsuitesuiteprojectspro.com/rest/v1
 *
 * Authentication: Bearer token in the Authorization header.
 * The company ID is stored in credentials.extra.companyId; a connection without
 * one is refused rather than sent to a blank host.
 *
 * Docs: https://docs.oracle.com/en/cloud/saas/netsuite-suiteprojects-pro/online-help/article_159837218957.html
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { connectionCompanyId, resolveTemplate } from './auth'
import { API_BASE_URL_TEMPLATE } from './constants'

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

/** Wraps a paginated SuiteProjects Pro list response. */
export interface SuiteProjectsListResponse<T> {
  message?: string
  data?: T[]
  meta?: {
    rowsPerPage?: number
    totalPages?: number
    totalRows?: number
    links?: Array<{ rel: string; href: string }>
  }
}

/** Wraps a single-record SuiteProjects Pro response. */
export interface SuiteProjectsSingleResponse<T> {
  message?: string
  data?: T
}

export class SuiteprojectsProClient {
  private http: AxiosInstance

  constructor(credentials: Credentials, fallbackCompanyId?: string) {
    const companyId = connectionCompanyId(credentials, fallbackCompanyId)
    this.http = axios.create({
      baseURL: resolveTemplate(API_BASE_URL_TEMPLATE, companyId),
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
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
