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

/**
 * Shape of a paged Microsoft Graph collection response. When more results
 * remain, `@odata.nextLink` holds an absolute URL to the next page.
 */
export interface GraphCollection<T> {
  value?: T[]
  '@odata.nextLink'?: string
}

/**
 * Thin Microsoft Graph REST client. The access token is sent as a Bearer
 * token on the `Authorization` header.
 */
export class MicrosoftTodoClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
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

  /**
   * Fetch ONE page of a Graph collection: page 1 is `path` with `params`, and
   * every later page is the absolute `@odata.nextLink` URL, requested whole
   * with no params of its own (axios ignores `baseURL` for an absolute URL).
   * The Graph paging guide (https://learn.microsoft.com/en-us/graph/paging):
   * "Use the entire URL in the `@odata.nextLink` property in a GET request to
   * retrieve the next page of results." and "Any other query parameters that
   * were present in the original request are also encoded in this URL."
   */
  async getPage<T>(
    path: string,
    params: Record<string, unknown>,
    nextLink: string | undefined,
  ): Promise<{ items: T[]; next: string | undefined }> {
    const data = nextLink
      ? await this.get<GraphCollection<T>>(nextLink)
      : await this.get<GraphCollection<T>>(path, params)
    return { items: data.value ?? [], next: data['@odata.nextLink'] || undefined }
  }
}
