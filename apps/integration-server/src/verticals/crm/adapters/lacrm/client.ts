import type { Credentials } from '../../adapter/interface'
import { BASE_URL } from './constants'

interface LacrmListResponse<T> {
  result: T[]
  numResults?: number
}

interface LacrmItemResponse<T> {
  result: T
}

async function request<T>(
  method: string,
  path: string,
  credentials: Credentials,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, String(v))
      }
    }
  }

  // userCode is stored in credentials.extra
  const userCode = (credentials as unknown as { extra?: { userCode?: string } }).extra?.userCode ?? ''

  const res = await fetch(url.toString(), {
    method,
    headers: {
      'Authorization': `Bearer ${credentials.accessToken}`,
      'UserCode': userCode,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`LACRM API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  return res.json() as Promise<T>
}

export class LacrmClient {
  constructor(private credentials: Credentials) {}

  async list<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[]; total: number }> {
    const res = await request<LacrmListResponse<T>>('GET', path, this.credentials, params)
    return {
      items: res.result ?? [],
      total: res.numResults ?? 0,
    }
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const res = await request<LacrmItemResponse<T>>('GET', path, this.credentials, params)
    if (!res.result) {
      throw Object.assign(
        new Error(`LACRM: not found at ${path}`),
        { statusCode: 404 },
      )
    }
    return res.result
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    // LACRM returns the created resource directly (not wrapped in result)
    return request<T>('POST', path, this.credentials, undefined, body)
  }

  async put<T>(path: string, params: Record<string, unknown>, body: unknown): Promise<T> {
    // LACRM updates are POST with an ID in the query string
    return request<T>('POST', path, this.credentials, params, body)
  }
}
