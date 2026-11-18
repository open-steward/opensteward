import type { Credentials } from '@opensteward/shared'
import { BASE_URL } from './constants'
import type {
  NetHuntFolder,
  NetHuntRecord,
  NetHuntRecordFilterResult,
  NetHuntTimelinePage,
} from './types'

/**
 * NetHunt Public REST API client.
 *
 * Auth, from https://nethunt.com/api/openapi.json:
 *   "securitySchemes":{"BearerAuth":{"scheme":"bearer","bearerFormat":"nh_live_*","type":"http"}}
 * and every 401 is "UNAUTHORIZED — missing or invalid bearer token."
 * The API key is stored as `credentials.accessToken` (simpleApiKey).
 */
async function request<T>(
  method: string,
  path: string,
  token: string,
  query?: Record<string, string | number | undefined>,
  body?: unknown,
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v))
    }
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`NetHunt CRM API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

function shapeError(what: string): Error {
  return Object.assign(new Error(`NetHunt CRM API returned an unexpected ${what} response`), {
    statusCode: 502,
  })
}

export class NetHuntCrmClient {
  private readonly token: string

  constructor(credentials: Credentials) {
    this.token = credentials.accessToken
  }

  /** GET /api/v2/folders — "Returns folders accessible to the authenticated workspace user." */
  async listFolders(): Promise<NetHuntFolder[]> {
    const res = await request<unknown>('GET', '/api/v2/folders', this.token)
    if (!Array.isArray(res)) throw shapeError('folder list')
    return res as NetHuntFolder[]
  }

  /** GET /api/v2/folders/{folderId} — "Returns the folder with the full `fields[]` schema." */
  async getFolder(folderId: string): Promise<NetHuntFolder> {
    return request<NetHuntFolder>(
      'GET',
      `/api/v2/folders/${encodeURIComponent(folderId)}`,
      this.token,
    )
  }

  /**
   * POST /api/v2/folders/{folderId}/records/filter with no `filter` and no
   * `sort`: "Omitting `filter` matches all records — combined with the
   * default sort and the cursor this is the way to export a whole folder page
   * by page (`limit` ≤ 1000 per page)."
   */
  async filterRecords(
    folderId: string,
    limit: number,
    cursor: string | undefined,
  ): Promise<NetHuntRecordFilterResult> {
    const res = await request<NetHuntRecordFilterResult>(
      'POST',
      `/api/v2/folders/${encodeURIComponent(folderId)}/records/filter`,
      this.token,
      { limit },
      cursor === undefined ? {} : { cursor },
    )
    if (!res || !Array.isArray(res.records)) throw shapeError('records/filter')
    return res
  }

  /** GET /api/v2/folders/{folderId}/records/{recordId} */
  async getRecord(folderId: string, recordId: string): Promise<NetHuntRecord> {
    return request<NetHuntRecord>(
      'GET',
      `/api/v2/folders/${encodeURIComponent(folderId)}/records/${encodeURIComponent(recordId)}`,
      this.token,
    )
  }

  /**
   * GET /api/v2/folders/{folderId}/records/{recordId}/timeline?types=comment —
   * "while `nextCursor` is returned, pass it back as `cursor` (with the SAME
   * filters) for the next page".
   */
  async commentTimeline(
    folderId: string,
    recordId: string,
    limit: number,
    cursor: string | undefined,
  ): Promise<NetHuntTimelinePage> {
    const res = await request<NetHuntTimelinePage>(
      'GET',
      `/api/v2/folders/${encodeURIComponent(folderId)}/records/${encodeURIComponent(recordId)}/timeline`,
      this.token,
      { types: 'comment', limit, cursor },
    )
    if (!res || !Array.isArray(res.events)) throw shapeError('timeline')
    return res
  }

  // ── Generic verbs (used only by the unrebuilt write methods) ─────────────

  async get<T>(path: string): Promise<T> {
    return request<T>('GET', path, this.token)
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, this.token, undefined, body)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PUT', path, this.token, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.token)
  }
}
