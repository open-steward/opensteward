import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
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

export class AdaCxClient {
  private http: AxiosInstance
  readonly botHandle: string
  private readonly origin: string

  constructor(credentials: Credentials) {
    const botHandle = String(credentials.extra?.['botHandle'] ?? '')
    if (!botHandle) throw new Error('ada-cx: botHandle missing from credentials.extra')
    this.botHandle = botHandle
    const baseURL = API_BASE_URL_TEMPLATE.replace('{botHandle}', botHandle)
    this.origin = new URL(baseURL).origin
    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, params ? { params } : undefined)
      return data
    })
  }

  /**
   * GET a next-page link Ada returned (`meta.next_page_uri`), as given. The
   * get-conversations example response shows it absolute
   * ("https://example.ada.support/api/v2/export/conversations?..."), while the
   * Getting Started samples resolve it against the host
   * ("fetch(`https://<YOUR-BOT-HANDLE>.ada.support/${endpoint}`" with
   * "endpoint = json.meta?.next_page_uri"), so both forms are resolved here.
   * The link carries the bearer token with it, so it is followed only on this
   * connection's own Ada host.
   */
  async getLink<T>(link: string): Promise<T> {
    let url: URL
    try {
      url = new URL(link, `${this.origin}/`)
    } catch {
      throw new Error(`ada-cx: next page link is not a URL: ${link}`)
    }
    if (url.origin !== this.origin)
      throw new Error(`ada-cx: next page link leaves ${this.origin}: ${url.origin}`)
    return withRetry(async () => {
      const { data } = await this.http.get<T>(url.toString())
      return data
    })
  }
}
