import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_PATH } from './constants'

/**
 * Thin HTTP client for the Twproject REST API (V1).
 *
 * "The API call is a HTTP JSON POST call" to `https://[your_server_url]/API/V1/`
 * (https://twproject.com/support/api-documentation/). Twproject is self-hosted,
 * so the server URL is the connection's `credentials.extra.serverUrl`, and the
 * API key rides in the body as the common parameter `APIKey`.
 */

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
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

/**
 * The documented response envelope: the common returns `ok`, `errors` and
 * `messagesFromController`, plus `object` (get) or `objects` and `hasMore`
 * (list).
 */
export interface TwprojectResponse<T> {
  ok: boolean
  errors?: Array<{ name: string; label?: string; error?: string }>
  messagesFromController?: Array<{ type: string; title?: string; message: string }>
  object?: T
  objects?: T[]
  hasMore?: boolean
}

/** The connection's Twproject server URL, without a trailing slash. */
export function serverUrlOf(credentials: Credentials): string {
  const raw = credentials.extra?.['serverUrl']
  const url = typeof raw === 'string' ? raw.trim().replace(/\/+$/, '') : ''
  if (!url) {
    throw Object.assign(
      new Error(
        'Twproject connection has no server URL: the API is served at https://[your_server_url]/API/V1/, so reconnect with your Twproject server URL.',
      ),
      { statusCode: 400, code: 'MISSING_SERVER_URL' },
    )
  }
  return url
}

export class TwprojectClient {
  private http: AxiosInstance
  private apiKey: string

  constructor(credentials: Credentials) {
    const serverUrl = serverUrlOf(credentials)
    this.apiKey = credentials.accessToken ?? ''
    this.http = axios.create({
      baseURL: serverUrl + API_PATH,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /**
   * POST one command. `ok: false` is an error: its `errors` and
   * `messagesFromController` are included in the thrown message.
   */
  async command<T>(body: Record<string, unknown>): Promise<TwprojectResponse<T>> {
    return withRetry(async () => {
      const { data } = await this.http.post<TwprojectResponse<T>>('', {
        ...body,
        APIKey: this.apiKey,
      })
      if (data.ok === false) {
        const parts = [
          ...(data.errors ?? []).map((e) => `${e.name}: ${e.error ?? e.label ?? ''}`),
          ...(data.messagesFromController ?? []).map((m) => `${m.type}: ${m.message}`),
        ]
        throw new Error(`Twproject API error: ${parts.join('; ') || 'ok: false'}`)
      }
      return data
    })
  }
}
