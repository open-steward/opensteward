import type { Credentials } from '@opensteward/shared'
import { CRM_BASE_URL, LEGACY_BASE_URL } from './constants'

/** The CRM modules `get_list_data` reads (collection: "9 core CRM modules"). */
export type BarantumModule = 'Contacts' | 'Org' | 'Deals' | 'Notes' | 'Calls' | 'Meetings' | 'Tasks'

/** One `get_list_data` page: `result.content[]` and the documented `page_last`. */
export interface BarantumListPage<T> {
  content: T[]
  pageLast: number
}

function apiError(status: number, detail: string): Error {
  return Object.assign(new Error(`Barantum API error ${status}: ${detail}`), { statusCode: status })
}

/**
 * `POST https://rest-api.barantum.com/api/get_list_data`.
 *
 * Documented body ("[<Module>] Get Data", Input Parameters): `token` (Yes),
 * `module` (Yes, "first letter must be capitalized"), `page` (Optional,
 * number) and the module's `<module>_uuid` filter (Optional). Documented
 * response: `{ "code": "200", "result": { "total", "page_total",
 * "page_last", "page_first", "per_page": 20, "page_current",
 * "page_previous", "page_next", "content": [...] } }`, and "401
 * Unauthorized if it failed".
 */
export async function getListData<T>(
  credentials: Credentials,
  module: BarantumModule,
  filters: { page?: number } & Record<string, string | number>,
): Promise<BarantumListPage<T>> {
  const res = await fetch(`${CRM_BASE_URL}/get_list_data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ token: credentials.accessToken, module, ...filters }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw apiError(res.status, text)
  }
  const body = (await res.json()) as { code?: unknown; result?: unknown }
  if (String(body.code) !== '200') {
    const status = Number(body.code)
    throw apiError(Number.isInteger(status) && status >= 400 ? status : 502, JSON.stringify(body))
  }
  const result = body.result as { content?: unknown; page_last?: unknown } | undefined
  const pageLast = Number(result?.page_last)
  if (!result || !Array.isArray(result.content) || !Number.isInteger(pageLast)) {
    throw apiError(502, `get_list_data for ${module} returned no result.content / result.page_last`)
  }
  return { content: result.content as T[], pageLast }
}

/**
 * The client the write methods still use. Its host and Bearer auth appear
 * nowhere in Barantum's docs; see LEGACY_BASE_URL.
 */
async function legacyRequest<T>(
  method: string,
  path: string,
  token: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${LEGACY_BASE_URL}${path}`, {
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
    throw apiError(res.status, text)
  }
  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export class BarantumLegacyWriteClient {
  private token: string

  constructor(credentials: Credentials) {
    this.token = credentials.accessToken
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return legacyRequest<T>('POST', path, this.token, body)
  }
}
