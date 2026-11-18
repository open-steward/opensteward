import type { Credentials } from '@opensteward/shared'

function baseUrlFrom(credentials: Credentials): string {
  const extra = credentials.extra as Record<string, unknown> | undefined
  const accountId = extra?.['accountId'] as string | undefined
  if (!accountId) throw new Error('NetSuite CRM: credentials.extra.accountId is required')
  return `https://${accountId}.suitetalk.api.netsuite.com/services/rest/record/v1`
}

async function request<T>(
  method: string,
  path: string,
  credentials: Credentials,
  params?: Record<string, unknown>,
  body?: unknown,
): Promise<T> {
  const base = baseUrlFrom(credentials)
  const url = new URL(`${base}${path}`)
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
      'Authorization': `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`NetSuite CRM API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class NetsuiteCrmClient {
  constructor(private credentials: Credentials) {}

  async list<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[] }> {
    const res = await request<{ items?: T[]; data?: T[] } | T[]>(
      'GET', path, this.credentials, params,
    )
    if (Array.isArray(res)) return { items: res }
    return { items: (res as { items?: T[]; data?: T[] }).items ?? (res as { items?: T[]; data?: T[] }).data ?? [] }
  }

  async get<T>(path: string): Promise<T> {
    return request<T>('GET', path, this.credentials)
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, this.credentials, undefined, body)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PUT', path, this.credentials, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.credentials)
  }
}
