/**
 * Process Street REST client.
 *
 * Docs (OpenAPI): https://public-api.process.st/api/v1.1/docs/openapi.json
 *
 * Authentication: "Every request must include an API key as
 * `X-API-KEY: <your-key>`." (securitySchemes.apiKeyAuth: header `X-API-Key`).
 *
 * Pagination: "List endpoints page through results using an opaque cursor
 * named `_` (yes, just an underscore)." Each response carries `links[]`; "If
 * there are more pages, you'll find an entry with `name: "next"`" and "Keep
 * following `next.href` until the `next` link is absent — that's the end."
 * "You can also reuse the `_` value from one response by passing it as the
 * `_` query parameter on the next request". This client does the latter, so
 * every request stays on the documented base URL with the connection's key.
 *
 * Rate limits: "If you receive a `429` response, wait for the duration
 * specified in the `Retry-After` header before retrying." GETs "are safe to
 * retry on any error".
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

/** A `links[]` entry: `name`, `href` and `type` are required in the spec. */
export interface ProcessStreetLink {
  name: string
  href: string
  rel?: string
  type?: string
}

/**
 * The `_` cursor of the response's `next` link, or undefined when there is
 * no `next` link (the documented end of the list). A `next` link without a
 * `_` parameter is outside the documented protocol and throws rather than
 * ending the list early.
 */
export function nextCursor(links: readonly ProcessStreetLink[] | undefined): string | undefined {
  const next = (links ?? []).find((l) => l.name === 'next')
  if (!next) return undefined
  const cursor = new URL(next.href, API_BASE_URL).searchParams.get('_')
  if (!cursor) throw new Error(`Process Street next link has no "_" cursor: ${next.href}`)
  return cursor
}

function retryDelayMs(err: AxiosError, attempt: number): number {
  const header = err.response?.headers?.['retry-after']
  const seconds = Number(header)
  if (header !== undefined && Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  return Math.pow(2, attempt) * 1000
}

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
        await new Promise((r) => setTimeout(r, retryDelayMs(axiosErr, i)))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class ProcessStreetClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'X-API-Key': credentials.accessToken,
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
}
