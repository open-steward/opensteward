import type { Credentials } from '@opensteward/shared'
import { BASE_URL, DEFAULT_PAGE_SIZE } from './constants'

// Qiscus uses Qiscus-App-Id + Qiscus-Secret-Key headers for authentication
// credentials.accessToken stores the secret_key
// credentials.extra.appId stores the app_id

async function request<T>(
  method: string,
  path: string,
  appId: string,
  secretKey: string,
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

  const res = await fetch(url.toString(), {
    method,
    headers: {
      'Qiscus-App-Id': appId,
      'Qiscus-Secret-Key': secretKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`Qiscus API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class QiscusClient {
  private appId: string
  private secretKey: string

  constructor(credentials: Credentials) {
    this.secretKey = credentials.accessToken
    const appId = credentials.extra?.['appId'] as string | undefined
    if (!appId) throw new Error('Qiscus: appId required in credentials.extra.appId')
    this.appId = appId
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return request<T>('GET', path, this.appId, this.secretKey, params)
  }

  async list<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[] }> {
    const page = Number(params['page'] ?? 1)
    const limit = Number(params['limit'] ?? DEFAULT_PAGE_SIZE)
    const res = await request<{ data?: T[]; contacts?: T[]; customers?: T[]; results?: T[] }>(
      'GET', path, this.appId, this.secretKey, { ...params, page, limit },
    )
    const items = res?.data ?? res?.contacts ?? res?.customers ?? res?.results ?? []
    return { items: Array.isArray(items) ? items : [] }
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, this.appId, this.secretKey, undefined, body)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PUT', path, this.appId, this.secretKey, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.appId, this.secretKey)
  }
}
