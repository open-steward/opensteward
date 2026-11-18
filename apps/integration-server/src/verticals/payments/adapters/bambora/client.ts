/**
 * Bambora NA Payment APIs client — thin axios wrapper.
 *
 * Auth is the Passcode scheme: `Authorization: Passcode <base64(id:passcode)>`
 * where the encoded string is what we store on `credentials.accessToken`.
 * Bodies and responses are JSON.
 *
 * "Listing" transactions is not a GET-with-cursor; Bambora exposes a reporting
 * search at `POST /reports` that takes a date range plus a `start_row` /
 * `end_row` window. The client offers a `searchPayments` helper for that, and a
 * generic `get` / `post` for the per-payment endpoints.
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL } from './constants'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const s = (err as AxiosError).response?.status
      if ((s === 429 || (s !== undefined && s >= 500 && s < 600)) && i < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

/** Shape of a Bambora `POST /reports` search body. */
export interface ReportSearchBody {
  name: 'Search'
  start_date: string
  end_date: string
  start_row: number
  end_row: number
  criteria?: Array<{ field: number; operator: string; value: string }>
}

export interface ReportSearchResponse<T> {
  records?: T[]
  // Bambora also echoes the search window; we only consume `records`.
  [k: string]: unknown
}

export class BamboraClient {
  private http: AxiosInstance

  constructor(credentials: Credentials) {
    this.http = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Passcode ${credentials.accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    })
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => (await this.http.get<T>(path, { params })).data)
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(async () => (await this.http.post<T>(path, body)).data)
  }

  /** Transaction search over a date window via the reporting endpoint. */
  async searchPayments<T>(body: ReportSearchBody): Promise<ReportSearchResponse<T>> {
    return this.post<ReportSearchResponse<T>>('/reports', body)
  }
}
