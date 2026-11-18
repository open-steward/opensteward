import type { Credentials } from '@opensteward/shared'

interface ODataListResponse<T> {
  value: T[]
  '@odata.count'?: number
}

function tokenFrom(credentials: Credentials): string {
  return credentials.accessToken
}

async function request<T>(
  method: string,
  url: string,
  credentials: Credentials,
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${tokenFrom(credentials)}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`Creatio API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }

  // 204 No Content (PATCH/DELETE)
  if (res.status === 204) return undefined as unknown as T

  return res.json() as Promise<T>
}

export class CreatioClient {
  private baseUrl: string

  constructor(
    private credentials: Credentials,
    instanceUrl: string,
  ) {
    this.baseUrl = `${instanceUrl}/0/odata`
  }

  /**
   * One offset page of a collection, in a stable `Id` order, with the total
   * the service reports for `$count=true` (undefined if it sends none).
   *
   * "$skip=n: The first n elements that must be excluded from the selection."
   * "$top=n: The first n elements that must be included in the selection."
   * "$count=true: Whether to extend the response body with information about
   * the total number of records in the selection."
   * — https://academy.creatio.com/guides/dev/development-on-creatio-platform/integrations-and-api/data-services/odata/basics/references/odata-odata-4
   *
   * `$skip` over an unordered set is not stable between requests, hence
   * `$orderby=Id`.
   */
  async listOrdered<T>(
    entity: string,
    select: string,
    skip: number,
    top: number,
  ): Promise<{ items: T[]; count?: number }> {
    const url = `${this.baseUrl}/${entity}?$select=${select}&$orderby=Id&$count=true&$top=${top}&$skip=${skip}`
    const res = await request<ODataListResponse<T>>('GET', url, this.credentials)
    const count = res['@odata.count']
    return {
      items: res.value ?? [],
      count: typeof count === 'number' && Number.isFinite(count) ? count : undefined,
    }
  }

  async get<T>(entity: string, id: string): Promise<T> {
    const url = `${this.baseUrl}/${entity}(${id})`
    return request<T>('GET', url, this.credentials)
  }

  async post<T>(entity: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}/${entity}`
    return request<T>('POST', url, this.credentials, body)
  }

  async patch(entity: string, id: string, body: unknown): Promise<void> {
    const url = `${this.baseUrl}/${entity}(${id})`
    await request<void>('PATCH', url, this.credentials, body)
  }

  async delete(entity: string, id: string): Promise<void> {
    const url = `${this.baseUrl}/${entity}(${id})`
    await request<void>('DELETE', url, this.credentials)
  }
}
