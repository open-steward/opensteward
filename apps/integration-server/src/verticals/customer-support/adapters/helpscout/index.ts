/**
 * Help Scout adapter — Inbox (Mailbox) API 2.0.
 *
 * Auth: OAuth 2.0 Authorization Code flow, no scopes (see ./auth.ts).
 * Data: conversations → tickets, threads → messages, customers → contacts,
 * users → users, tags, teams. Every path, filter and field is from
 * https://developer.helpscout.com/mailbox-api/ (fetched 2026-09-28); what the
 * docs do not offer refuses with 501 NOT_SUPPORTED before any request.
 *
 * Paging: every list is HAL. "Requests that return multiple results are
 * paginated to 50 items, with the exception of List Conversation requests,
 * which are paginated to 25 items", with no documented size parameter, and
 * "there will not be a next link if the end of the result set has been
 * reached." So each list walks `_links.next.href` through the shared
 * `pageByRows`, which cuts the caller's `{ page, limit }` out of those
 * fixed-size upstream pages and reports `hasMore` exactly.
 * https://developer.helpscout.com/mailbox-api/overview/pagination/
 */
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Message } from '../../schema/message'
import type { Contact } from '../../schema/contact'
import type { User } from '../../schema/user'
import type { Tag } from '../../schema/tag'
import type { Team } from '../../schema/team'
import type { Macro } from '../../schema/macro'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeCode as helpScoutExchangeCode,
  refreshCredentials as helpScoutRefreshCredentials,
} from './auth'
import { HelpScoutClient } from './client'
import { verifyHelpScoutWebhook, parseHelpScoutWebhookEvents } from './webhook'

import { transformTicket, type RawHelpScoutConversation } from './transform/ticket'
import { transformMessage, type RawHelpScoutThread } from './transform/message'
import { transformContact, type RawHelpScoutCustomer } from './transform/contact'
import { transformUser, type RawHelpScoutUser } from './transform/user'
import { transformTag, type RawHelpScoutTag } from './transform/tag'
import { transformTeam, type RawHelpScoutTeam } from './transform/team'

export interface HelpScoutAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/** One HAL list response: rows under `_embedded[key]`, the next page at `_links.next.href`. */
interface HalPage {
  _embedded?: Record<string, unknown[] | undefined>
  _links?: { next?: { href?: string } }
  page?: { totalElements?: number }
}

/**
 * `modifiedSince` in the documented shape, `2018-05-04T12:00:03Z`: whole
 * seconds, floored, so the window can only widen ("modified after this
 * timestamp").
 */
function modifiedSince(d: Date | undefined): Record<string, string> {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return {}
  return { modifiedSince: d.toISOString().replace(/\.\d{3}Z$/, 'Z') }
}

function segment(id: string): string {
  return encodeURIComponent(String(id))
}

export class HelpScoutAdapter implements CustomerSupportAdapter {
  readonly platform = 'helpscout'
  readonly version = '0.2.0'

  private clientId: string
  private clientSecret: string

  constructor(config: HelpScoutAdapterConfig) {
    this.clientId = config?.clientId ?? ''
    this.clientSecret = config?.clientSecret ?? ''
  }

  /** No credential form: Help Scout has no API keys, only OAuth apps. */
  credentialFields(): CredentialField[] {
    return []
  }

  /**
   * Help Scout's authorize URL takes `client_id` and `state` only. It
   * documents no scopes (an app acts as the authorizing user), so
   * `overrideScopes` has nothing to narrow and no `scope` is sent; nor a
   * `redirect_uri`, which is fixed on the app in My Apps.
   */
  getAuthUrl(state: string, _overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, state)
  }

  /** The documented exchange sends no redirect_uri, so `_redirectUri` is not used. */
  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return helpScoutExchangeCode(code, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return helpScoutRefreshCredentials(credentials, this.clientId, this.clientSecret)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyHelpScoutWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseHelpScoutWebhookEvents(payload)
  }

  private client(credentials: Credentials): HelpScoutClient {
    return new HelpScoutClient(credentials)
  }

  /**
   * The caller's page of a HAL list. Upstream page j+1 is fetched from page
   * j's `_links.next.href` (a replayable position: it names the page number
   * and repeats the filters), and a page without one ends the list. The key
   * carries this connection, the path and every filter; the upstream page
   * size is fixed by Help Scout, so the caller's limit stays out of it.
   */
  private async halList<R>(
    credentials: Credentials,
    path: string,
    key: string,
    params: QueryParams,
    query: Record<string, string> = {},
  ): Promise<R[]> {
    const client = this.client(credentials)
    const pagerKey = cursorPagerKey(connectionScope('helpscout', credentials), path, query)
    let total: number | undefined
    const { items } = await pageByRows<R, string>(pagerKey, params, async (href) => {
      const res =
        href === undefined
          ? await client.get<HalPage>(path, query)
          : await client.getHref<HalPage>(href)
      const rows = res?._embedded?.[key]
      if (typeof res?.page?.totalElements === 'number') total = res.page.totalElements
      return {
        items: Array.isArray(rows) ? (rows as R[]) : [],
        next: res?._links?.next?.href || undefined,
      }
    })
    if (total !== undefined) reportUpstreamPage(params, { totalCount: total })
    return items
  }

  // ── Tickets (conversations) ────────────────────────────────────────────────

  /**
   * GET /v2/conversations. "By default only active conversations are listed
   * … If you want to list all conversations, use ?status=all". Sorted oldest
   * first (`sortField=createdAt&sortOrder=asc`, both documented) so new
   * conversations land after the pages already served. `updated_after` is
   * the documented `modifiedSince` filter.
   * https://developer.helpscout.com/mailbox-api/endpoints/conversations/list/
   */
  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const rows = await this.halList<RawHelpScoutConversation>(
      credentials,
      '/conversations',
      'conversations',
      params,
      {
        status: 'all',
        sortField: 'createdAt',
        sortOrder: 'asc',
        ...modifiedSince(params.updatedAfter),
      },
    )
    return rows.map(transformTicket)
  }

  /** GET /v2/conversations/{conversationId} */
  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const raw = await this.client(credentials).get<RawHelpScoutConversation>(
      `/conversations/${segment(id)}`,
    )
    return transformTicket(raw)
  }

  // ── Messages (threads) ────────────────────────────────────────────────────

  /**
   * GET /v2/conversations/{id}/threads. No filter is documented, so
   * `updated_after` is not applied: one conversation's threads are bounded.
   * https://developer.helpscout.com/mailbox-api/endpoints/conversations/threads/list/
   */
  async listMessages(
    credentials: Credentials,
    ticketId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    const rows = await this.halList<RawHelpScoutThread>(
      credentials,
      `/conversations/${segment(ticketId)}/threads`,
      'threads',
      params,
    )
    return rows.map((t) => transformMessage(t, String(ticketId)))
  }

  /**
   * Threads are addressed under their conversation
   * (`/v2/conversations/{conversationId}/threads/...`); a thread id alone
   * reaches no documented endpoint.
   */
  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw notSupported(
      `helpscout: threads are conversation-scoped; list them with listMessages(ticketId). id=${id}`,
    )
  }

  // ── Contacts (customers) ──────────────────────────────────────────────────

  /**
   * GET /v2/customers, oldest first, `updated_after` as `modifiedSince`
   * ("Returns only customers that were modified after this date").
   * https://developer.helpscout.com/mailbox-api/endpoints/customers/list/
   */
  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const rows = await this.halList<RawHelpScoutCustomer>(
      credentials,
      '/customers',
      'customers',
      params,
      { sortField: 'createdAt', sortOrder: 'asc', ...modifiedSince(params.updatedAfter) },
    )
    return rows.map(transformContact)
  }

  /** GET /v2/customers/{customerId} */
  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawHelpScoutCustomer>(
      `/customers/${segment(id)}`,
    )
    return transformContact(raw)
  }

  // ── Users ─────────────────────────────────────────────────────────────────

  /**
   * GET /v2/users. The account's users are a bounded list with no modified
   * filter, so `updated_after` is not applied.
   * https://developer.helpscout.com/mailbox-api/endpoints/users/list/
   */
  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const rows = await this.halList<RawHelpScoutUser>(credentials, '/users', 'users', params)
    return rows.map(transformUser)
  }

  /** GET /v2/users/{userId} */
  async getUser(credentials: Credentials, id: string): Promise<User> {
    const raw = await this.client(credentials).get<RawHelpScoutUser>(`/users/${segment(id)}`)
    return transformUser(raw)
  }

  // ── Tags ──────────────────────────────────────────────────────────────────

  /**
   * GET /v2/tags ("Tags are returned in alphabetical order"). Bounded, no
   * modified filter.
   * https://developer.helpscout.com/mailbox-api/endpoints/tags/list/
   */
  async listTags(credentials: Credentials, params: QueryParams): Promise<Tag[]> {
    const rows = await this.halList<RawHelpScoutTag>(credentials, '/tags', 'tags', params)
    return rows.map(transformTag)
  }

  /** GET /v2/tags/{tagId} https://developer.helpscout.com/mailbox-api/endpoints/tags/get/ */
  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    const raw = await this.client(credentials).get<RawHelpScoutTag>(`/tags/${segment(id)}`)
    return transformTag(raw)
  }

  // ── Teams ─────────────────────────────────────────────────────────────────

  /**
   * GET /v2/teams. Bounded, no modified filter.
   * https://developer.helpscout.com/mailbox-api/endpoints/teams/list-teams/
   */
  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const rows = await this.halList<RawHelpScoutTeam>(credentials, '/teams', 'teams', params)
    return rows.map(transformTeam)
  }

  /** The Teams endpoints are List Teams, List Team Members and Update Team Members: no get-by-id. */
  async getTeam(_credentials: Credentials, id: string): Promise<Team> {
    throw notSupported(`helpscout: the Teams API has no get-team endpoint; use listTeams. id=${id}`)
  }

  // ── Macros ────────────────────────────────────────────────────────────────

  /**
   * Help Scout's nearest thing is Saved Replies, which live under one inbox
   * (`/v2/mailboxes/{mailboxId}/saved-replies`): there is no account-wide
   * list, and a saved reply id alone reaches no endpoint.
   */
  async listMacros(_credentials: Credentials, _params: QueryParams): Promise<Macro[]> {
    throw notSupported(
      'helpscout: saved replies are listed per inbox (/v2/mailboxes/{mailboxId}/saved-replies); there is no account-wide list',
    )
  }

  async getMacro(_credentials: Credentials, id: string): Promise<Macro> {
    throw notSupported(
      `helpscout: saved replies are addressed per inbox (/v2/mailboxes/{mailboxId}/saved-replies/{id}); id=${id}`,
    )
  }
}
