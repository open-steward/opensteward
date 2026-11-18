/**
 * ProProfs Help Desk API client.
 *
 * All endpoints are POST-only. Authentication credentials (`account_email` and
 * `token`) are injected into every request body rather than via an HTTP header.
 *
 * Base URL: https://www.proprofsdesk.com/app/api/v1
 * Each path must end with a trailing slash (the API is case-sensitive).
 */
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
      if ((status === 429 || (status !== undefined && status >= 500 && status < 600)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class ProprofsHelpDeskClient {
  private http: AxiosInstance
  private authBody: { account_email: string; token: string }

  constructor(credentials: Credentials) {
    this.authBody = {
      account_email: String(credentials.extra?.['accountEmail'] ?? ''),
      token: credentials.accessToken,
    }
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * POST a request to `path`, merging auth fields into the body.
   * All ProProfs Help Desk API calls are POST; there are no GET endpoints.
   * `query` goes on the URL: /list/ticket/ takes its page there, as the
   * documented next_page_link (`.../list/ticket/?page=2`) shows.
   */
  async post<T>(
    path: string,
    body: Record<string, unknown> = {},
    query?: Record<string, unknown>,
  ): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.post<T>(
        path,
        { ...this.authBody, ...body },
        query ? { params: query } : undefined,
      )
      return data
    })
  }
}
