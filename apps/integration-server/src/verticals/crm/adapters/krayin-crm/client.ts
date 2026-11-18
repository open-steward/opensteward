import type { Credentials } from '@opensteward/shared'

/**
 * HTTP client for the Krayin CRM REST API, the first-party `krayin/rest-api`
 * Composer package (https://github.com/krayin/rest-api).
 *
 * Base URL: `${instanceUrl}/api/v1`. The package mounts its routes with
 * `Route::prefix('api')` (src/Providers/RestApiServiceProvider.php) around
 * `Route::group(['prefix' => 'v1'], …)` (src/Routes/V1/api-v1.php), and its
 * OpenAPI annotations document every path under it, for example
 * `path="/api/v1/contacts/persons"` and `path="/api/v1/settings/pipelines"`.
 *
 * Auth: Laravel Sanctum bearer token. src/Config/l5-swagger.php, securityScheme
 * `sanctum_admin`: "Enter token in format (Bearer <token>)".
 */

/** Laravel's paginator state on a paginated resource collection. */
export interface KrayinPageMeta {
  current_page?: number
  last_page?: number
  total?: number
}

/**
 * One page of a Krayin list endpoint. Every list the adapter reads is
 * `Resource::collection($query->paginate(limit))`, which Laravel serialises as
 * `{ data, links, meta }`: "Paginated responses always contain meta and links
 * keys with information about the paginator's state"
 * (https://laravel.com/docs/11.x/eloquent-resources#pagination).
 */
export interface KrayinListPage<T> {
  items: T[]
  meta: KrayinPageMeta | undefined
}

async function request<T>(
  method: string,
  path: string,
  token: string,
  baseUrl: string,
  params?: Record<string, unknown>,
  body?: unknown,
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
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`Krayin CRM API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export class KrayinCrmClient {
  private token: string
  private baseUrl: string

  constructor(credentials: Credentials) {
    this.token = credentials.accessToken
    const instanceUrl = credentials.extra?.['instanceUrl'] as string | undefined
    if (!instanceUrl) throw new Error('credentials.extra.instanceUrl is required for Krayin CRM')
    this.baseUrl = `${instanceUrl.replace(/\/+$/, '')}/api/v1`
  }

  /**
   * GET one resource. Every documented show endpoint answers with
   * `@OA\Property(property="data", ref=…)`, so the record is read from `data`
   * and nothing else.
   */
  async get<T>(path: string): Promise<T> {
    const res = await request<unknown>('GET', path, this.token, this.baseUrl)
    if (!isRecord(res) || !isRecord(res['data'])) {
      throw new Error(`Krayin CRM GET ${path}: response has no "data" object`)
    }
    return res['data'] as T
  }

  /**
   * GET one page of a list. Sends only the documented `page` ("Page number")
   * and `limit` ("Limit") query parameters, and reads the documented `data`
   * array plus Laravel's paginator `meta`.
   */
  async list<T>(path: string, page: number, limit: number): Promise<KrayinListPage<T>> {
    const res = await request<unknown>('GET', path, this.token, this.baseUrl, { page, limit })
    if (!isRecord(res) || !Array.isArray(res['data'])) {
      throw new Error(`Krayin CRM GET ${path}: response has no "data" array`)
    }
    const meta = isRecord(res['meta']) ? (res['meta'] as KrayinPageMeta) : undefined
    return { items: res['data'] as T[], meta }
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await request<unknown>('POST', path, this.token, this.baseUrl, undefined, body)
    const raw = res as Record<string, unknown>
    return (raw?.['data'] ?? res) as T
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const res = await request<unknown>('PUT', path, this.token, this.baseUrl, undefined, body)
    const raw = res as Record<string, unknown>
    return (raw?.['data'] ?? res) as T
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.token, this.baseUrl)
  }
}
