import type { Credentials } from '@opensteward/shared'

const BASE_URL = 'https://api.hubapi.com'

interface HubSpotListResponse<T> {
  results: T[]
  paging?: {
    next?: {
      after?: string
      link?: string
    }
  }
}

interface HubSpotPipelinesResponse<T> {
  results: T[]
}

async function request<T>(
  method: string,
  path: string,
  credentials: Credentials,
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
      'Authorization': `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(
      new Error(`HubSpot API error ${res.status}: ${text}`),
      { statusCode: res.status },
    )
  }

  // 204 No Content on DELETE
  if (res.status === 204) return undefined as unknown as T

  return res.json() as Promise<T>
}

export class HubSpotClient {
  constructor(private credentials: Credentials) {}

  async list<T>(
    path: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[]; hasMore: boolean; nextCursor?: string }> {
    const res = await request<HubSpotListResponse<T>>(
      'GET',
      path,
      this.credentials,
      params,
    )
    return {
      items: res.results ?? [],
      hasMore: res.paging?.next?.after != null,
      nextCursor: res.paging?.next?.after,
    }
  }

  async listPipelines<T>(path: string): Promise<T[]> {
    const res = await request<HubSpotPipelinesResponse<T>>(
      'GET',
      path,
      this.credentials,
    )
    return res.results ?? []
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return request<T>('GET', path, this.credentials, params)
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, this.credentials, undefined, body)
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PATCH', path, this.credentials, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await request<void>('DELETE', path, this.credentials)
  }

  /**
   * Fetch the first associated resource ID of a given type for an object.
   * e.g. GET /crm/v3/objects/contacts/{id}/associations/company
   */
  /**
   * Resolve one association per source record, for a whole page at once.
   *
   * The object list endpoints do not return associations, so linking a page of
   * notes to their contacts/companies/deals would otherwise cost one request
   * per note per target type. This is one request per target type per PAGE —
   * 3 instead of 300 on a full page of notes.
   *
   * Returns source id → first associated target id. "First" because the
   * canonical Note carries a single `contact_id` / `company_id` / `deal_id`,
   * while HubSpot permits many; picking one is lossy either way, and the
   * complete set stays available in `metadata`.
   *
   * Failure is deliberately non-fatal. An association read can fail on its own
   * (a missing scope for the TARGET object type, most often) and a note with
   * no linkage is still a note worth returning — where dropping the whole page
   * would lose the bodies too.
   */
  async batchFirstAssociations(
    fromObjectType: string,
    toObjectType: string,
    ids: string[],
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>()
    if (ids.length === 0) return out
    try {
      const res = await request<{
        results?: Array<{ from?: { id?: string }; to?: Array<{ toObjectId?: string | number }> }>
      }>(
        'POST',
        `/crm/v4/associations/${fromObjectType}/${toObjectType}/batch/read`,
        this.credentials,
        undefined,
        { inputs: ids.map((id) => ({ id })) },
      )
      for (const row of res.results ?? []) {
        const from = row.from?.id
        const to = row.to?.[0]?.toObjectId
        // `toObjectId` comes back as a NUMBER while every id we expose is a
        // string; skipping the coercion would produce ids that never match.
        if (from != null && to != null) out.set(String(from), String(to))
      }
    } catch {
      return out
    }
    return out
  }

  async getFirstAssociation(
    objectType: string,
    objectId: string,
    associationType: string,
  ): Promise<string | undefined> {
    try {
      const res = await request<{ results: Array<{ id: string }> }>(
        'GET',
        `/crm/v3/objects/${objectType}/${objectId}/associations/${associationType}`,
        this.credentials,
      )
      return res.results?.[0]?.id
    } catch {
      return undefined
    }
  }
}
