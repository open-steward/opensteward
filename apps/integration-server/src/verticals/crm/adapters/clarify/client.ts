import type { Credentials } from '@opensteward/shared'
import { CLARIFY_API_BASE } from './constants'

export interface ClarifyListResponse<T> {
  data: T[]
  links?: {
    next?: string | null
    prev?: string | null
  }
  meta?: {
    total_records?: number
    total_pages?: number
  }
}

export interface ClarifyRecordResponse<T> {
  data: T
}

async function request<T>(
  method: string,
  url: string,
  apiKey: string,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<T> {
  const fullUrl = new URL(url)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        fullUrl.searchParams.set(k, String(v))
      }
    }
  }

  const res = await fetch(fullUrl.toString(), {
    method,
    headers: {
      Authorization: `api-key ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`Clarify API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  if (res.status === 204) return undefined as unknown as T

  return res.json() as Promise<T>
}

export class ClarifyClient {
  private apiKey: string
  private workspaceSlug: string

  constructor(credentials: Credentials) {
    this.apiKey = credentials.accessToken
    // workspace slug stored in extra or refreshToken
    const extra = credentials.extra as Record<string, string> | undefined
    this.workspaceSlug = extra?.['workspaceSlug'] ?? credentials.refreshToken ?? ''
  }

  private base(objectType: string): string {
    return `${CLARIFY_API_BASE}/workspaces/${this.workspaceSlug}/objects/${objectType}`
  }

  async list<T>(
    objectType: string,
    params: Record<string, unknown> = {},
  ): Promise<ClarifyListResponse<T>> {
    const url = `${this.base(objectType)}/resources`
    return request<ClarifyListResponse<T>>('GET', url, this.apiKey, params)
  }

  async get<T>(objectType: string, id: string): Promise<T> {
    const url = `${this.base(objectType)}/records/${id}`
    return request<T>('GET', url, this.apiKey)
  }

  async create<T>(objectType: string, body: unknown): Promise<T> {
    const url = `${this.base(objectType)}/records`
    return request<T>('POST', url, this.apiKey, undefined, body)
  }

  async update<T>(objectType: string, id: string, body: unknown): Promise<T> {
    const url = `${this.base(objectType)}/records/${id}`
    return request<T>('PATCH', url, this.apiKey, undefined, body)
  }

  async delete(objectType: string, id: string): Promise<void> {
    const url = `${this.base(objectType)}/records/${id}`
    await request<void>('DELETE', url, this.apiKey)
  }
}
