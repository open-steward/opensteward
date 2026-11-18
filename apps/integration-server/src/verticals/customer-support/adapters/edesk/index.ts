/**
 * eDesk adapter for the customer-support vertical.
 *
 * Auth: static API key (Bearer token).
 * Base URL: https://api.edesk.com/v1
 * Docs: https://developers.edesk.com/reference
 *
 * Supported resources: tickets, messages, contacts, users, tags.
 * Unsupported (no eDesk endpoint): teams, macros — these auto-501 via the
 * base adapter.
 *
 * Pagination: page + itemsPerPage query params; response envelope:
 *   { paginator: { totalItemsCount, currentPage, itemsPerPage }, data: [...] }
 */
import {
  pageLocally,
  reportUpstreamPage,
  type Credentials,
  type CredentialField,
  type QueryParams,
} from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Message } from '../../schema/message'
import type { Contact } from '../../schema/contact'
import type { User } from '../../schema/user'
import type { Tag } from '../../schema/tag'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { EdeskClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformTicket, type RawEdeskTicket } from './transform/ticket'
import { transformMessage, type RawEdeskMessage } from './transform/message'
import { transformContact, type RawEdeskContact } from './transform/contact'
import { transformUser, type RawEdeskUser } from './transform/user'
import { transformTag, type RawEdeskTag } from './transform/tag'

/** eDesk list response envelope */
interface PagedResponse<T> {
  paginator?: {
    totalItemsCount?: number
    currentPage?: number
    itemsPerPage?: number
  }
  data?: T[]
}

/** eDesk single-object response envelope (`BaseResponse` with `data`). */
interface DataResponse<T> {
  data?: T
}

export class EdeskAdapter implements CustomerSupportAdapter {
  readonly platform = 'edesk'
  readonly version = '0.1.0'

  constructor(_config?: Record<string, unknown>) {}

  credentialFields(): CredentialField[] {
    return adapterCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return adapterExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('eDesk uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): EdeskClient {
    return new EdeskClient(credentials)
  }

  /**
   * One caller page of a documented list endpoint. eDesk pages by `page` +
   * `itemsPerPage` and returns `paginator.totalItemsCount`
   * (https://developers.edesk.com/reference/pagination), so one upstream page
   * is one caller page and the total makes `hasMore` exact. No maximum is
   * documented, so the caller's limit is sent as is.
   */
  private async listCollection<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
  ): Promise<T[]> {
    const size = params.limit ?? DEFAULT_PAGE_SIZE
    const legacyCursor = Number(params['cursor'])
    const page =
      params.page ?? (Number.isInteger(legacyCursor) && legacyCursor >= 1 ? legacyCursor : 1)
    const res = await this.client(credentials).get<PagedResponse<T>>(path, {
      page,
      itemsPerPage: size,
    })
    const rows = res.data ?? []
    const total = res.paginator?.totalItemsCount
    if (typeof total === 'number') {
      reportUpstreamPage(params, { totalCount: total, hasMore: page * size < total })
    }
    return rows
  }

  // ── Tickets ────────────────────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const rows = await this.listCollection<RawEdeskTicket>(credentials, '/tickets', params)
    return rows.map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const raw = await this.client(credentials).get<RawEdeskTicket>(`/tickets/${id}`)
    return transformTicket(raw)
  }

  // ── Messages ───────────────────────────────────────────────────────────────

  /**
   * eDesk documents no list-messages endpoint. A ticket's messages are named
   * by Read Ticket (`GET /tickets/{ticketId}`), whose `data.messages_ids` is
   * the "Array of Message Ids", and each is read by Read Message
   * (`GET /messages/{messageId}`). The id array is the ticket's whole message
   * list, so it is paged locally and only the caller's page is fetched.
   */
  async listMessages(
    credentials: Credentials,
    ticketId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    const client = this.client(credentials)
    const res = await client.get<DataResponse<RawEdeskTicket>>(
      `/tickets/${encodeURIComponent(ticketId)}`,
    )
    const ids = res.data?.messages_ids
    if (!Array.isArray(ids)) {
      throw Object.assign(new Error(`eDesk ticket ${ticketId} returned no messages_ids array`), {
        statusCode: 502,
        code: 'UPSTREAM_SHAPE',
      })
    }
    const out: Message[] = []
    for (const messageId of pageLocally(ids, params)) {
      out.push(transformMessage(await this.readMessage(client, String(messageId)), ticketId))
    }
    return out
  }

  async getMessage(credentials: Credentials, id: string): Promise<Message> {
    const raw = await this.readMessage(this.client(credentials), id)
    if (raw.ticket_id == null) {
      throw Object.assign(new Error(`eDesk message ${id} returned no ticket_id`), {
        statusCode: 502,
        code: 'UPSTREAM_SHAPE',
      })
    }
    return transformMessage(raw, String(raw.ticket_id))
  }

  /** Read Message: the `Ticket_Item` is under `data` (TicketItem_Get). */
  private async readMessage(client: EdeskClient, id: string): Promise<RawEdeskMessage> {
    const res = await client.get<DataResponse<RawEdeskMessage>>(
      `/messages/${encodeURIComponent(id)}`,
    )
    if (!res.data) {
      throw Object.assign(new Error(`eDesk message ${id} returned no data`), {
        statusCode: 502,
        code: 'UPSTREAM_SHAPE',
      })
    }
    return res.data
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const rows = await this.listCollection<RawEdeskContact>(credentials, '/contacts', params)
    return rows.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawEdeskContact>(`/contacts/${id}`)
    return transformContact(raw)
  }

  // ── Users (agents) ─────────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const rows = await this.listCollection<RawEdeskUser>(credentials, '/users', params)
    return rows.map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const raw = await this.client(credentials).get<RawEdeskUser>(`/users/${id}`)
    return transformUser(raw)
  }

  // ── Tags ───────────────────────────────────────────────────────────────────

  async listTags(credentials: Credentials, params: QueryParams): Promise<Tag[]> {
    const rows = await this.listCollection<RawEdeskTag>(credentials, '/tags', params)
    return rows.map(transformTag)
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    const raw = await this.client(credentials).get<RawEdeskTag>(`/tags/${id}`)
    return transformTag(raw)
  }
}
