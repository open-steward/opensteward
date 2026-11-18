/**
 * Vendasta CRM API client.
 *
 * The Vendasta API uses a gRPC-Gateway pattern: all endpoints are HTTP POST
 * with JSON bodies, including list and get operations. Bearer token auth.
 *
 * Pagination uses opaque cursor tokens returned in `pagingMetadata.nextCursor`.
 */

import type { Credentials } from '@opensteward/shared'
import { VENDASTA_PROD_BASE_URL } from './constants'

// ── Wire types ─────────────────────────────────────────────────────────────────

/** A single field value as returned/sent by the Vendasta CRM API. */
export interface VendastaFieldValue {
  fieldId?: string
  externalId?: string
  stringValue?: string
  booleanValue?: boolean
  dateValue?: string
  integerValue?: string
  floatValue?: number
  stringValues?: { values?: string[] }
  currencyValue?: { value?: number; currencyCode?: string }
  [key: string]: unknown
}

/** A raw CRM object as returned by the Vendasta API (list or get). */
export interface VendastaCrmObject {
  crmObjectId?: string
  namespace?: string
  ownerId?: string
  externalId?: string
  fields?: VendastaFieldValue[]
  created?: string
  updated?: string
  deleted?: string
  [key: string]: unknown
}

interface VendastaListResponse {
  crmObjects?: VendastaCrmObject[]
  pagingMetadata?: {
    hasMore?: boolean
    nextCursor?: string
    totalResults?: string
  }
}

interface VendastaGetMultiResponse {
  crmObjects?: VendastaCrmObject[]
}

interface VendastaPipeline {
  pipelineId?: string
  name?: string
  namespace?: string
  objectType?: string
  stages?: Array<{
    stageId?: string
    name?: string
    [key: string]: unknown
  }>
  [key: string]: unknown
}

interface VendastaListPipelinesResponse {
  pipelines?: VendastaPipeline[]
}

// ── HTTP helper ────────────────────────────────────────────────────────────────

async function request<T>(
  path: string,
  credentials: Credentials,
  body: unknown,
  baseUrl: string = VENDASTA_PROD_BASE_URL,
): Promise<T> {
  const url = `${baseUrl}${path}`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`Vendasta API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }

  // Some delete endpoints return 200 with an empty body
  const text = await res.text()
  if (!text || text === '{}') return {} as T
  return JSON.parse(text) as T
}

// ── Client ─────────────────────────────────────────────────────────────────────

export class VendastaClient {
  constructor(
    private credentials: Credentials,
    private baseUrl: string = VENDASTA_PROD_BASE_URL,
  ) {}

  /** List CRM objects with cursor-based pagination. */
  async list(
    path: string,
    namespace: string,
    cursor?: string,
    pageSize: number = 25,
  ): Promise<{ items: VendastaCrmObject[]; hasMore: boolean; nextCursor?: string }> {
    const body: Record<string, unknown> = {
      namespace,
      pagingOptions: {
        pageSize: String(pageSize),
        ...(cursor ? { cursor } : {}),
      },
    }
    const res = await request<VendastaListResponse>(path, this.credentials, body, this.baseUrl)
    return {
      items: res.crmObjects ?? [],
      hasMore: res.pagingMetadata?.hasMore ?? false,
      nextCursor: res.pagingMetadata?.nextCursor,
    }
  }

  /** Fetch one or more CRM objects by ID. */
  async getMulti(path: string, namespace: string, ids: string[]): Promise<VendastaCrmObject[]> {
    const res = await request<VendastaGetMultiResponse>(
      path,
      this.credentials,
      { namespace, crmObjectIds: ids },
      this.baseUrl,
    )
    return res.crmObjects ?? []
  }

  /** Create a CRM object; returns the created object. */
  async create(
    path: string,
    namespace: string,
    fields: VendastaFieldValue[],
    ownerId?: string,
  ): Promise<VendastaCrmObject> {
    const crmObject: VendastaCrmObject = { fields, namespace }
    if (ownerId) crmObject.ownerId = ownerId
    const res = await request<{ crmObject?: VendastaCrmObject }>(
      path,
      this.credentials,
      { namespace, crmObject },
      this.baseUrl,
    )
    return res.crmObject ?? {}
  }

  /** Update a CRM object; returns the updated object. */
  async update(
    path: string,
    namespace: string,
    id: string,
    fields: VendastaFieldValue[],
  ): Promise<VendastaCrmObject> {
    const crmObject: VendastaCrmObject = { crmObjectId: id, fields }
    const res = await request<{ crmObject?: VendastaCrmObject }>(
      path,
      this.credentials,
      { namespace, crmObject },
      this.baseUrl,
    )
    return res.crmObject ?? { crmObjectId: id, fields }
  }

  /** Delete a CRM object. */
  async delete(path: string, namespace: string, id: string): Promise<void> {
    await request<unknown>(path, this.credentials, { namespace, crmObjectId: id }, this.baseUrl)
  }

  /** List pipelines. */
  async listPipelines(path: string, namespace: string): Promise<VendastaPipeline[]> {
    const res = await request<VendastaListPipelinesResponse>(
      path,
      this.credentials,
      // v1ListPipelinesRequest: {listOptions (required): v1ListOptions {namespace (required), objectType, crmObjectSubtype}}.
      // "Wrap all arguments in a listOptions object; namespace goes inside listOptions
      // (unlike the other list endpoints)." (crm.openapi.json, Pipelines_ListPipelines)
      { listOptions: { namespace } },
      this.baseUrl,
    )
    return res.pipelines ?? []
  }

  /** Get pipelines by IDs. */
  async getPipelinesByIds(
    path: string,
    namespace: string,
    ids: string[],
  ): Promise<VendastaPipeline[]> {
    const res = await request<{ pipelines?: VendastaPipeline[] }>(
      path,
      this.credentials,
      { namespace, pipelineIds: ids },
      this.baseUrl,
    )
    return res.pipelines ?? []
  }
}

// ── CRM External API (/org) ────────────────────────────────────────────────────

/** ListCrmRecords response: `{ objects[], next_cursor, total_objects, has_more }`. */
export interface VendastaOrgListResponse<T> {
  objects?: T[]
  next_cursor?: string
  total_objects?: number
  has_more?: boolean
}

/**
 * POST {orgBaseUrl}/list/{namespace}/{resourceTypeCode} (ListCrmRecords).
 * Sends only the documented `page` object ("Parameters for pagination of
 * results": `cursor`, `limit`); the cursor is omitted on the first page.
 * https://raw.githubusercontent.com/vendasta/api-gateway-docs/master/openapi/crm/crm.json
 */
export async function listOrgRecords<T>(
  credentials: Credentials,
  orgBaseUrl: string,
  namespace: string,
  resourceTypeCode: string,
  cursor: string | undefined,
  limit: number,
): Promise<VendastaOrgListResponse<T>> {
  return request<VendastaOrgListResponse<T>>(
    `/list/${encodeURIComponent(namespace)}/${resourceTypeCode}`,
    credentials,
    { page: { limit, ...(cursor ? { cursor } : {}) } },
    orgBaseUrl,
  )
}

// ── Field helpers ──────────────────────────────────────────────────────────────

/**
 * Extract a string value from a Vendasta field array by fieldId.
 * Returns undefined if not found or the field has no string value.
 * Never throws.
 */
export function getField(
  fields: VendastaFieldValue[] | undefined,
  fieldId: string,
): string | undefined {
  if (!fields) return undefined
  const f = fields.find((fv) => fv.fieldId === fieldId)
  if (!f) return undefined
  return f.stringValue ?? undefined
}

/**
 * Extract a number value from a Vendasta field array (floatValue or integerValue).
 * Never throws.
 */
export function getFieldNumber(
  fields: VendastaFieldValue[] | undefined,
  fieldId: string,
): number | undefined {
  if (!fields) return undefined
  const f = fields.find((fv) => fv.fieldId === fieldId)
  if (!f) return undefined
  if (f.floatValue !== undefined) return f.floatValue
  if (f.integerValue !== undefined) {
    const n = parseInt(f.integerValue, 10)
    return isNaN(n) ? undefined : n
  }
  return undefined
}

/**
 * Build a Vendasta FieldValue with stringValue.
 */
export function strField(fieldId: string, value: string | undefined): VendastaFieldValue | null {
  if (value === undefined || value === null) return null
  return { fieldId, stringValue: value }
}

/**
 * Build a Vendasta FieldValue with currencyValue.
 */
export function currencyField(
  fieldId: string,
  amount: number,
  currency: string,
): VendastaFieldValue {
  return { fieldId, currencyValue: { value: amount, currencyCode: currency } }
}
