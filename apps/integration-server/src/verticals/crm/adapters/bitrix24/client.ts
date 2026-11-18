import type { Credentials } from '@opensteward/shared'

/**
 * Bitrix24 REST client.
 *
 * Bitrix24 uses a method-based REST API where every operation is a named
 * method POSTed to the portal's REST interface.
 *
 * Address. The OAuth token response's `client_endpoint` is "The address of the
 * Bitrix24 REST interface. All method calls start with it", and "Method calls
 * go to the address from client_endpoint: the method name is appended to it,
 * and access_token is passed in the auth parameter." Its documented example
 * is `"client_endpoint": "https://portal.bitrix24.com/rest/"`
 * (https://apidocs.bitrix24.com/settings/oauth/index.html). `exchangeCode`
 * stores it as `credentials.extra.baseUrl`, so the method name is appended to
 * that value as is. A manual connection that stores the bare portal address
 * (`https://portal.bitrix24.com`) gets the `/rest/` segment added, the form
 * the docs give for a direct call: "https://your-domain.bitrix24.com/rest/method?auth=ACCESS_TOKEN"
 * (https://apidocs.bitrix24.com/settings/how-to-call-rest-api/general-principles.html).
 *
 * Auth. "OAuth Token — passed in the auth parameter of the request" (same
 * page). The documented OAuth cURL examples send it in the JSON body, e.g.
 * `-d '{"id":"1","auth":"**put_access_token_here**"}'`
 * (https://apidocs.bitrix24.com/api-reference/crm/outdated/category-old/crm-deal-category-get.html).
 * No Bitrix24 page documents an `Authorization: Bearer` header, so none is sent.
 *
 * List responses: "If the response contains the next field, pass its value in
 * the start parameter of the next request", and `next` "is not returned on the
 * last page" (https://apidocs.bitrix24.com/settings/how-to-call-rest-api/list-methods-pecularities.html).
 */

interface Bitrix24ListResponse<T> {
  result: T
  next?: number
  total?: number
}

interface Bitrix24ItemResponse<T> {
  result: T
}

/** The address a method name is appended to: `client_endpoint`, or `<portal>/rest/`. */
export function restEndpoint(credentials: Credentials): string {
  const base = credentials.extra?.['baseUrl'] as string | undefined
  if (!base) throw new Error('Bitrix24: credentials.extra.baseUrl is required')
  const root = base.replace(/\/+$/, '')
  return root.endsWith('/rest') ? `${root}/` : `${root}/rest/`
}

async function request<T>(
  method: string,
  credentials: Credentials,
  body: Record<string, unknown> = {},
): Promise<T> {
  const url = `${restEndpoint(credentials)}${method}`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ ...body, auth: credentials.accessToken }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`Bitrix24 API error ${res.status} calling ${method}: ${text}`), {
      statusCode: res.status,
    })
  }

  return res.json() as Promise<T>
}

export class Bitrix24Client {
  constructor(private credentials: Credentials) {}

  /** One page of a list method whose `result` is the array of rows. */
  async list<T>(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<{ items: T[]; nextStart?: number; total?: number }> {
    const res = await request<Bitrix24ListResponse<T[]>>(method, this.credentials, params)
    return {
      items: res.result ?? [],
      nextStart: res.next,
      total: res.total,
    }
  }

  /** One page of a list method whose `result` is an object holding the rows. */
  async listIn<R, T>(
    method: string,
    params: Record<string, unknown>,
    rows: (result: R) => T[],
  ): Promise<{ items: T[]; nextStart?: number; total?: number }> {
    const res = await request<Bitrix24ListResponse<R>>(method, this.credentials, params)
    // An answer without its rows is not an empty page: reading it as one would
    // tell a sync the collection is empty.
    const items = res.result == null ? undefined : rows(res.result)
    if (!Array.isArray(items)) {
      throw Object.assign(new Error(`Bitrix24 ${method}: response has no rows in \`result\``), {
        statusCode: 502,
      })
    }
    return { items, nextStart: res.next, total: res.total }
  }

  async get<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const res = await request<Bitrix24ItemResponse<T>>(method, this.credentials, params)
    return res.result
  }

  /** Create — Bitrix24 returns the new ID as result. */
  async add(method: string, fields: Record<string, unknown>): Promise<string> {
    const res = await request<Bitrix24ItemResponse<string | number>>(method, this.credentials, {
      fields,
    })
    return String(res.result)
  }

  /** Update — resolves when done. */
  async update(method: string, id: string, fields: Record<string, unknown>): Promise<void> {
    await request<Bitrix24ItemResponse<boolean>>(method, this.credentials, { id, fields })
  }

  /** Delete — resolves when done. */
  async delete(method: string, id: string): Promise<void> {
    await request<Bitrix24ItemResponse<boolean>>(method, this.credentials, { id })
  }
}
