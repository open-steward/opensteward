/**
 * Yellow.ai HTTP client.
 *
 * Auth: the API key in the documented `x-api-key` header.
 * Base URL: the documented server for the connection's region (constants.ts).
 *
 * Every operation this adapter calls documents `bot` ("The unique ID of the
 * bot", query, required); the client appends it from credentials.extra.botId.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { INDIA_BASE_URL, REGION_BASE_URLS } from './constants'

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

function baseUrlFor(credentials: Credentials): string {
  const region = credentials.extra?.region
  if (typeof region !== 'string' || region === '') return INDIA_BASE_URL
  const url = REGION_BASE_URLS[region]
  if (!url) {
    throw Object.assign(
      new Error(
        `yellow-ai region "${region}" has no documented server; use one of ${Object.keys(REGION_BASE_URLS).join(', ')}`,
      ),
      { statusCode: 400, code: 'VALIDATION' },
    )
  }
  return url
}

export class YellowAiClient {
  private http: AxiosInstance
  readonly botId: string

  constructor(credentials: Credentials) {
    const baseURL = baseUrlFor(credentials)
    this.botId = typeof credentials.extra?.botId === 'string' ? credentials.extra.botId : ''

    this.http = axios.create({
      baseURL,
      headers: {
        'x-api-key': credentials.accessToken,
        Accept: 'application/json',
      },
      timeout: 30_000,
    })
  }

  /** GET request. The documented `bot` query parameter is merged in. */
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        params: { bot: this.botId, ...params },
      })
      return data
    })
  }
}
