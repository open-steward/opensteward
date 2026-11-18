import type { Credentials } from '@opensteward/shared'
import { BASE_URL } from './constants'

function buildAuthHeader(credentials: Credentials): string {
  // HTTP Basic auth: base64(apiToken:emailAddress)
  const email = String(credentials.extra?.['email'] ?? '')
  const raw = `${credentials.accessToken}:${email}`
  return `Basic ${Buffer.from(raw).toString('base64')}`
}

async function request<T>(
  method: string,
  path: string,
  authHeader: string,
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
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`Solve CRM API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class SolveCrmClient {
  private authHeader: string

  constructor(credentials: Credentials) {
    this.authHeader = buildAuthHeader(credentials)
  }

  async list<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<T[]> {
    // Solve360 wraps results in a JSON object; unwrap by known key chain
    const res = await request<Record<string, unknown>>(
      'GET',
      path,
      this.authHeader,
      params,
    )
    if (Array.isArray(res)) return res as T[]
    const typed = res as { contacts?: T[]; organisations?: T[]; projects?: T[]; activities?: T[]; notes?: T[]; data?: T[] }
    const items = typed.data ?? typed.contacts ?? typed.organisations ?? typed.projects ?? typed.activities ?? typed.notes ?? []
    return Array.isArray(items) ? items : []
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return request<T>('GET', path, this.authHeader, params)
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, this.authHeader, undefined, body)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PUT', path, this.authHeader, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.authHeader)
  }
}
