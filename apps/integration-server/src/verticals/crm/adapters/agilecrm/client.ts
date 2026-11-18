import type { Credentials } from '@opensteward/shared'
import { buildBaseUrl } from './constants'

function basicAuth(credentials: Credentials): string {
  const email = (credentials.extra?.['email'] as string | undefined) ?? ''
  const apiKey = credentials.accessToken
  return Buffer.from(`${email}:${apiKey}`).toString('base64')
}

async function request<T>(
  method: string,
  baseUrl: string,
  path: string,
  credentials: Credentials,
  params?: Record<string, unknown>,
  body?: unknown,
  form?: URLSearchParams,
): Promise<T> {
  const url = new URL(`${baseUrl}${path}`)
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
      Authorization: `Basic ${basicAuth(credentials)}`,
      'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json',
      Accept: 'application/json',
    },
    body: form ? form.toString() : body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`AgileCRM API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }

  // DELETE returns 204 No Content; treat as success
  if (res.status === 204) return undefined as T

  return res.json() as Promise<T>
}

export class AgileCrmClient {
  private baseUrl: string

  constructor(private credentials: Credentials) {
    const domain = (credentials.extra?.['domain'] as string | undefined) ?? ''
    this.baseUrl = buildBaseUrl(domain)
  }

  async list<T>(path: string, params: Record<string, unknown> = {}): Promise<T[]> {
    const items = await request<T[]>('GET', this.baseUrl, path, this.credentials, params)
    return Array.isArray(items) ? items : []
  }

  /**
   * POST a form-encoded body to a list endpoint and return the array it
   * answers with. AgileCRM's company list takes its paging this way:
   * "Page_size,global_sort_key and cursor should be sent as a form parameter
   * (Content-Type: application/x-www-form-urlencoded )."
   */
  async listByForm<T>(path: string, form: Record<string, string>): Promise<T[]> {
    const items = await request<T[]>(
      'POST',
      this.baseUrl,
      path,
      this.credentials,
      undefined,
      undefined,
      new URLSearchParams(form),
    )
    return Array.isArray(items) ? items : []
  }

  async get<T>(path: string): Promise<T> {
    const item = await request<T>('GET', this.baseUrl, path, this.credentials)
    if (item == null) {
      throw Object.assign(new Error(`AgileCRM: not found at ${path}`), { statusCode: 404 })
    }
    return item
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const item = await request<T>('POST', this.baseUrl, path, this.credentials, undefined, body)
    if (item == null) throw new Error(`AgileCRM: POST ${path} returned no data`)
    return item
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const item = await request<T>('PUT', this.baseUrl, path, this.credentials, undefined, body)
    if (item == null) throw new Error(`AgileCRM: PUT ${path} returned no data`)
    return item
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', this.baseUrl, path, this.credentials)
  }
}
