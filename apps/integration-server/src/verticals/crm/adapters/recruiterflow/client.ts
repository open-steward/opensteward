/**
 * HTTP client for the Recruiterflow external API.
 *
 * Auth: RF-Api-Key header on every request.
 * Pagination: current_page / items_per_page query params for GET list endpoints.
 * Response envelope: { data: T, RESULT: "SUCCESS"|"FAILURE", message?: string }
 */

import type { Credentials } from '@opensteward/shared'
import { BASE_URL } from './constants'

interface RecruiterflowEnvelope<T> {
  data: T
  RESULT?: string
  message?: string
  total_items?: number
}

async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  apiKey: string,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
    }
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      'RF-Api-Key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`Recruiterflow API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  const json = (await res.json()) as RecruiterflowEnvelope<T>

  if (json.RESULT === 'FAILURE') {
    throw Object.assign(
      new Error(`Recruiterflow API failure: ${json.message ?? 'Unknown error'}`),
      { statusCode: 400 },
    )
  }

  return json.data
}

export class RecruiterflowClient {
  private apiKey: string

  constructor(credentials: Credentials) {
    this.apiKey = credentials.accessToken
  }

  /**
   * GET a paginated list. Returns the data array.
   * Recruiterflow list endpoints accept current_page / items_per_page as query params.
   */
  async list<T>(
    path: string,
    page: number,
    limit: number,
    extra: Record<string, unknown> = {},
  ): Promise<T[]> {
    const result = await request<T[]>(
      'GET',
      path,
      this.apiKey,
      { current_page: page, items_per_page: limit, include_count: false, ...extra },
    )
    return Array.isArray(result) ? result : []
  }

  /** GET a single resource by id (passed as query param). */
  async get<T>(path: string, id: string | number): Promise<T> {
    return request<T>('GET', path, this.apiKey, { id })
  }

  /** POST to create/update. Returns the created/updated object. */
  async post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, this.apiKey, undefined, body)
  }
}
