import type { Credentials } from '@opensteward/shared'

const BASE_URL = 'https://www.wixapis.com'

function tokenFrom(credentials: Credentials): string {
  return credentials.accessToken
}

async function request<T>(
  method: string,
  path: string,
  credentials: Credentials,
  body?: unknown,
): Promise<T> {
  const url = `${BASE_URL}${path}`
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${tokenFrom(credentials)}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`Wix CRM API error ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

/**
 * Contacts v4 response shapes, from
 * https://dev.wix.com/docs/api-reference/crm/members-contacts/contacts/contacts/contact-v4/query-contacts.md
 * ("Return type: QueryContactsResponse") and .../get-contact.md
 * ("Return type: GetContactResponse - name: contact | type: Contact").
 * Only the fields the adapter reads are typed.
 */
export interface WixPagingMetadata {
  /** "The number of items returned in this response." */
  count?: number
  /** "The offset which was requested." */
  offset?: number
  /** "The total number of items that match the query." */
  total?: number
  /** "A flag that indicates the server failed to calculate 'total' field." */
  tooManyToCount?: boolean
}

export interface WixContactListResponse {
  contacts?: WixContact[]
  pagingMetadata?: WixPagingMetadata
}

export interface WixContactResponse {
  contact: WixContact
}

export interface WixContact {
  id?: string
  revision?: number
  source?: { sourceType?: string; appId?: string }
  createdDate?: string
  updatedDate?: string
  primaryInfo?: { email?: string; phone?: string }
  info?: {
    name?: { first?: string; last?: string }
    company?: string
    jobTitle?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export class WixCrmClient {
  constructor(private credentials: Credentials) {}

  /**
   * "URL: https://www.wixapis.com/contacts/v4/contacts/query / Method: POST",
   * body `{ query: { paging: { limit, offset } } }` ("Number of items to
   * return. ... Default: `50`. <br> Maximum: `1000`." / "Number of items to
   * skip in the current sort order.").
   */
  async queryContacts(limit: number, offset: number): Promise<WixContactListResponse> {
    return request<WixContactListResponse>(
      'POST',
      '/contacts/v4/contacts/query',
      this.credentials,
      { query: { paging: { limit, offset } } },
    )
  }

  /** "URL: https://www.wixapis.com/contacts/v4/contacts/{id} / Method: GET" */
  async getContact(id: string): Promise<WixContact> {
    const res = await request<WixContactResponse>(
      'GET',
      `/contacts/v4/contacts/${encodeURIComponent(id)}`,
      this.credentials,
    )
    return res.contact
  }

  async createContact(body: unknown): Promise<WixContact> {
    const res = await request<WixContactResponse>(
      'POST',
      '/crm/v3/contacts',
      this.credentials,
      body,
    )
    return res.contact
  }

  async updateContact(id: string, body: unknown): Promise<WixContact> {
    const res = await request<WixContactResponse>(
      'PATCH',
      `/crm/v3/contacts/${id}`,
      this.credentials,
      body,
    )
    return res.contact
  }

  async deleteContact(id: string): Promise<void> {
    await request<void>('DELETE', `/crm/v3/contacts/${id}`, this.credentials)
  }
}
