/**
 * Corteza CRM HTTP client.
 *
 * Corteza Compose API (compose.yaml served by every instance at
 * /api/docs/compose.yaml; docs.cortezaproject.org integrator guide
 * "Working With Low Code Records"):
 *
 *   GET    {base}/api/compose/namespace/?slug={slug}                         — find a namespace
 *   GET    {base}/api/compose/namespace/{namespaceID}/module/?handle={handle} — find a module
 *   GET    {base}/api/compose/namespace/{namespaceID}/module/{moduleID}/record/            — list
 *   GET    {base}/api/compose/namespace/{namespaceID}/module/{moduleID}/record/{recordID}  — read
 *   POST   {base}/api/compose/namespace/{namespaceID}/module/{moduleID}/record/            — create
 *   POST   {base}/api/compose/namespace/{namespaceID}/module/{moduleID}/record/{recordID}  — update
 *   DELETE {base}/api/compose/namespace/{namespaceID}/module/{moduleID}/record/{recordID}  — delete
 *
 * Record routes take NUMERIC namespace and module IDs ("namespaceID —
 * Namespace ID", "moduleID — Module ID" in compose.yaml). A slug or handle in
 * those segments parses to 0 on the server and is rejected, so the IDs are
 * looked up first by the documented `slug` ("Search by namespace slug") and
 * `handle` ("Search by handle") filters.
 *
 * Response envelope: { response: { filter: {...}, set: [...] } } for lists,
 * { response: {...} } for one record.
 *
 * Paging: "When you wish to access a specific page, you must provide the
 * pageCursor=$PAGE_CURSOR query parameter. When accessing the next page,
 * $PAGE_CURSOR is filter.nextPage" — and nextPage is "omitted if there is no
 * next page".
 *
 * Auth: "Each HTTP request to a protected resource must provide the bearer JWT
 * token in the authorization header."
 */

import type { Credentials } from '@opensteward/shared'
import { CORTEZA_COMPOSE_PATH } from './constants'

/**
 * A single field value in a Corteza record. `value` is omitted when empty
 * (server/compose/types/record_value.go: `Value string json:"value,omitempty"`).
 */
export interface CortezaFieldValue {
  name: string
  value?: string
}

/**
 * A Corteza Compose record, per server/compose/types/record.go (2024.9.x):
 * recordID, moduleID, namespaceID, values, ownedBy, createdAt, createdBy,
 * updatedAt, updatedBy, deletedAt, deletedBy.
 */
export interface CortezaRecord {
  recordID: string
  moduleID: string
  namespaceID: string
  values?: CortezaFieldValue[]
  createdAt?: string
  updatedAt?: string
  deletedAt?: string | null
  ownedBy?: string
  createdBy?: string
  updatedBy?: string
  [key: string]: unknown
}

interface CortezaSetResponse<T> {
  response?: {
    filter?: {
      limit?: number
      cursor?: string
      nextPage?: string
      prevPage?: string
      [key: string]: unknown
    }
    set?: T[] | null
  }
}

interface CortezaSingleResponse {
  response: CortezaRecord
}

/** server/compose/types/namespace.go: `ID uint64 json:"namespaceID,string"`, `Slug string json:"slug"`. */
interface CortezaNamespace {
  namespaceID: string
  slug: string
}

/** server/compose/types/module.go: `ID uint64 json:"moduleID,string"`, `Handle string json:"handle"`. */
interface CortezaModule {
  moduleID: string
  handle: string
}

/** One upstream record page: its rows and the cursor that starts the next page. */
export interface CortezaRecordPage {
  items: CortezaRecord[]
  /** `filter.nextPage`, absent on the last page. */
  next?: string
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404, code: 'NOT_FOUND' })
}

async function request<T>(
  method: string,
  url: string,
  credentials: Credentials,
  params?: Record<string, string | number | undefined>,
  body?: unknown,
): Promise<T> {
  const fullUrl = new URL(url)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) fullUrl.searchParams.set(k, String(v))
    }
  }

  const res = await fetch(fullUrl.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`Corteza API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }

  // 204 No Content on DELETE
  if (res.status === 204) return undefined as unknown as T

  return res.json() as Promise<T>
}

/** The numeric IDs a record route needs. */
export interface CortezaModuleRef {
  namespaceID: string
  moduleID: string
}

export class CortezaClient {
  constructor(
    private credentials: Credentials,
    /** The customer's Corteza origin, already normalised by the adapter. */
    private baseUrl: string,
  ) {}

  private get compose(): string {
    return `${this.baseUrl}${CORTEZA_COMPOSE_PATH}`
  }

  /** GET /compose/namespace/?slug= → the namespace whose slug is exactly `slug`. */
  async findNamespaceId(slug: string): Promise<string> {
    const res = await request<CortezaSetResponse<CortezaNamespace>>(
      'GET',
      `${this.compose}/namespace/`,
      this.credentials,
      { slug },
    )
    const hit = (res.response?.set ?? []).find((n) => n.slug === slug)
    if (!hit) throw notFound(`Corteza namespace with slug '${slug}' not found on this instance`)
    return String(hit.namespaceID)
  }

  /** GET /compose/namespace/{namespaceID}/module/?handle= → the module whose handle is exactly `handle`. */
  async findModuleId(namespaceID: string, handle: string): Promise<string> {
    const res = await request<CortezaSetResponse<CortezaModule>>(
      'GET',
      `${this.compose}/namespace/${namespaceID}/module/`,
      this.credentials,
      { handle },
    )
    const hit = (res.response?.set ?? []).find((m) => m.handle === handle)
    if (!hit)
      throw notFound(`Corteza module with handle '${handle}' not found in namespace ${namespaceID}`)
    return String(hit.moduleID)
  }

  private recordsPath(ref: CortezaModuleRef): string {
    return `${this.compose}/namespace/${ref.namespaceID}/module/${ref.moduleID}/record/`
  }

  private recordPath(ref: CortezaModuleRef, id: string): string {
    return `${this.recordsPath(ref)}${encodeURIComponent(id)}`
  }

  /** One page of records: `limit` rows, starting at `pageCursor` (page 1 when absent). */
  async listPage(
    ref: CortezaModuleRef,
    limit: number,
    pageCursor: string | undefined,
  ): Promise<CortezaRecordPage> {
    const res = await request<CortezaSetResponse<CortezaRecord>>(
      'GET',
      this.recordsPath(ref),
      this.credentials,
      { limit, pageCursor },
    )
    const next = res.response?.filter?.nextPage
    return {
      items: res.response?.set ?? [],
      ...(typeof next === 'string' && next !== '' ? { next } : {}),
    }
  }

  async get(ref: CortezaModuleRef, id: string): Promise<CortezaRecord> {
    const res = await request<CortezaSingleResponse>(
      'GET',
      this.recordPath(ref, id),
      this.credentials,
    )
    return res.response
  }

  /** Create a record. Corteza uses POST to the collection endpoint. */
  async create(ref: CortezaModuleRef, values: CortezaFieldValue[]): Promise<CortezaRecord> {
    const res = await request<CortezaSingleResponse>(
      'POST',
      this.recordsPath(ref),
      this.credentials,
      undefined,
      { values },
    )
    return res.response
  }

  /** Update a record. Corteza uses POST to the individual record endpoint. */
  async update(
    ref: CortezaModuleRef,
    id: string,
    values: CortezaFieldValue[],
  ): Promise<CortezaRecord> {
    const res = await request<CortezaSingleResponse>(
      'POST',
      this.recordPath(ref, id),
      this.credentials,
      undefined,
      { values },
    )
    return res.response
  }

  async delete(ref: CortezaModuleRef, id: string): Promise<void> {
    await request<void>('DELETE', this.recordPath(ref, id), this.credentials)
  }
}
