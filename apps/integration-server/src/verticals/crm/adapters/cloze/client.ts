/**
 * Cloze REST API client.
 *
 * Authentication: API key passed as Bearer token in the Authorization header.
 *   Authorization: Bearer <api_key>
 *
 * Pagination: page-based via `pagenumber` / `pagesize` query params.
 * Response envelope: { errorcode: 0, <resource>: [...] | {...} }
 */

import type { Credentials } from '@opensteward/shared'
import { CLOZE_BASE_URL } from './constants'

interface ClozeEnvelope {
  errorcode: number
  message?: string
  [key: string]: unknown
}

async function request<T extends ClozeEnvelope>(
  method: string,
  path: string,
  apiKey: string,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<T> {
  const url = new URL(`${CLOZE_BASE_URL}${path}`)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, String(v))
      }
    }
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`Cloze API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  const json = (await res.json()) as T
  if (json.errorcode !== 0) {
    throw Object.assign(
      new Error(`Cloze API error ${json.errorcode}: ${json.message ?? 'unknown'}`),
      { statusCode: 422 },
    )
  }
  return json
}

export class ClozeClient {
  private apiKey: string

  constructor(credentials: Credentials) {
    this.apiKey = credentials.accessToken
  }

  async get<T extends ClozeEnvelope>(
    path: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    return request<T>('GET', path, this.apiKey, params)
  }

  async post<T extends ClozeEnvelope>(
    path: string,
    body: unknown,
  ): Promise<T> {
    return request<T>('POST', path, this.apiKey, undefined, body)
  }

  async delete<T extends ClozeEnvelope>(
    path: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    return request<T>('DELETE', path, this.apiKey, params)
  }
}
