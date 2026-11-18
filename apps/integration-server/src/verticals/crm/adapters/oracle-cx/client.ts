import type { Credentials } from '@opensteward/shared'

/** Shape returned by Oracle CX list endpoints. */
export interface OracleCxListResponse<T> {
  items: T[]
  links: Array<{ rel: string; href: string }>
  /** "Indicates whether more resources are available on the server than the subset returned in the response." */
  hasMore?: boolean
}

function baseUrl(credentials: Credentials): string {
  const instanceUrl = (credentials.extra?.['instanceUrl'] as string | undefined) ?? ''
  return `${instanceUrl}/crmRestApi/resources/latest`
}

async function request<T>(
  method: string,
  url: string,
  credentials: Credentials,
  queryParams?: Record<string, string | number>,
  body?: unknown,
): Promise<T> {
  const u = new URL(url)
  if (queryParams) {
    for (const [k, v] of Object.entries(queryParams)) {
      if (v !== undefined && v !== null) {
        u.searchParams.set(k, String(v))
      }
    }
  }

  const res = await fetch(u.toString(), {
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
    throw Object.assign(new Error(`Oracle CX API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }

  return res.json() as Promise<T>
}

export class OracleCxClient {
  constructor(private credentials: Credentials) {}

  private base(): string {
    return baseUrl(this.credentials)
  }

  /**
   * One upstream page at an explicit `limit` and `offset`, with the documented
   * `hasMore` flag. Oracle notes a limit/offset result isn't ordered unless
   * `orderBy` is sent, so callers pass a unique key to keep pages stable.
   */
  async listPage<T>(
    path: string,
    query: { limit: number; offset: number; orderBy: string; fields?: string },
  ): Promise<{ items: T[]; hasMore?: boolean }> {
    const params: Record<string, string | number> = {
      limit: query.limit,
      offset: query.offset,
      orderBy: query.orderBy,
    }
    if (query.fields) params.fields = query.fields

    const res = await request<OracleCxListResponse<T>>(
      'GET',
      `${this.base()}${path}`,
      this.credentials,
      params,
    )
    return {
      items: res.items ?? [],
      ...(typeof res.hasMore === 'boolean' ? { hasMore: res.hasMore } : {}),
    }
  }

  /**
   * One record of a collection, found by an integer key with the documented
   * `q` filter: "This query parameter defines the where clause. The resource
   * collection will be queried using the provided expressions." The item paths
   * are keyed by PartyNumber / OptyNumber / ActivityNumber, not by the integer
   * ids the list methods return, so a read-back filters the collection instead.
   * Returns undefined when no row matches.
   */
  async findByKey<T>(
    path: string,
    key: string,
    value: string,
    fields: string,
  ): Promise<T | undefined> {
    const res = await request<OracleCxListResponse<T>>(
      'GET',
      `${this.base()}${path}`,
      this.credentials,
      { q: `${key}=${value}`, limit: 1, fields },
    )
    return res.items?.[0]
  }

  /**
   * One record through a documented key finder, sent in the documented form
   * "?finder=<finderName>;<variableName>=<variableValue>", e.g. opportunities'
   * "PrimaryKey: Finds an opportunity by the primary key opportunity ID.
   * Finder Variables: OptyId; integer; The unique identifier of the
   * opportunity." Returns undefined when no row matches.
   */
  async findByFinder<T>(
    path: string,
    finder: string,
    variable: string,
    value: string,
    fields: string,
  ): Promise<T | undefined> {
    const res = await request<OracleCxListResponse<T>>(
      'GET',
      `${this.base()}${path}`,
      this.credentials,
      { finder: `${finder};${variable}=${value}`, fields },
    )
    return res.items?.[0]
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', `${this.base()}${path}`, this.credentials, undefined, body)
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PATCH', `${this.base()}${path}`, this.credentials, undefined, body)
  }

  async delete(path: string): Promise<void> {
    await request<unknown>('DELETE', `${this.base()}${path}`, this.credentials)
  }
}
