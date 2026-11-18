/**
 * Helpshift adapter for the customer-support vertical.
 *
 * Auth: HTTP Basic with api_key as username + empty password, domain in
 *   credentials.extra.domain (per-tenant URL segment).
 * Base URL: https://api.helpshift.com/v1/{domain}/{resource}
 * Pagination: page (1-based) + page-size query params; response: { issues, total-pages, ... }
 *
 * Supported resources:
 *   - tickets  (Helpshift "issues")  GET /{domain}/issues + GET /{domain}/issues/{id}
 *   - messages (inline on issue)     messages[] inside issue payload
 *   - contacts (Helpshift "users")   GET /{domain}/users + GET /{domain}/users/{id}
 *   - users    (Helpshift "agents")  GET /{domain}/agents
 *
 * Not supported (Helpshift has no REST endpoint for these):
 *   - tags          — strings on issues only; listTags/getTag refuse with 501
 *   - teams/queues  — queues returned inline on issues only; no list endpoint
 *   - macros/canned responses — not in Helpshift REST API
 *
 * Schema-firewall: no attachment bytes, no voice audio, no AI-reply content.
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
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { HelpshiftClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { verifyHelpshiftWebhook, parseHelpshiftWebhookEvents } from './webhook'

import { transformTicket, type RawHelpshiftIssue } from './transform/ticket'
import { transformMessage, type RawHelpshiftMessage } from './transform/message'
import { transformContact, type RawHelpshiftUser } from './transform/contact'
import { transformUser, type RawHelpshiftAgent } from './transform/user'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface HelpshiftAdapterConfig {}

interface IssuesResponse {
  issues?: RawHelpshiftIssue[]
  'total-pages'?: number
  'total-hits'?: number
  page?: number
  'page-size'?: number
}

interface UsersResponse {
  users?: RawHelpshiftUser[]
  'total-pages'?: number
}

interface AgentsResponse {
  agents?: RawHelpshiftAgent[]
  'total-pages'?: number
}

export class HelpshiftAdapter implements CustomerSupportAdapter {
  readonly platform = 'helpshift'
  readonly version = '0.1.0'

  constructor(_config: HelpshiftAdapterConfig) {}

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
    throw new Error('helpshift uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyHelpshiftWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseHelpshiftWebhookEvents(payload)
  }

  private client(credentials: Credentials): HelpshiftClient {
    return new HelpshiftClient(credentials)
  }

  /**
   * Build Helpshift pagination params.
   * Helpshift uses 1-based `page` and `page-size`.
   * QueryParams.cursor is treated as the 1-based page number.
   */
  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      'page-size': params.limit ?? DEFAULT_PAGE_SIZE,
      page: params['cursor'] ? Number(params['cursor']) : 1,
    }
  }

  // ── Tickets (Issues) ────────────────────────────────────────────────────────

  /**
   * GET /issues paging, per https://developers.helpshift.com/rest-api/scenarios/:
   * "There is another parameter page-size for some endpoints (ie. GET /issues )
   * ... adjusting the total-hits to an integer between 1-1000." and "The
   * parameters page and page-size together can be used to traverse the data
   * returned by these endpoints." One upstream page is one caller page; the
   * response's `total-pages` marks the end.
   */
  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const page = params.page ?? 1
    const requested = params.limit ?? DEFAULT_PAGE_SIZE
    const pageSize = Math.min(requested, MAX_PAGE_SIZE)
    const res = await this.client(credentials).get<IssuesResponse>('/issues', {
      'page-size': pageSize,
      page,
    })
    const totalPages = res['total-pages']
    const totalHits = res['total-hits']
    reportUpstreamPage(params, {
      ...(typeof totalPages === 'number' ? { hasMore: page < totalPages } : {}),
      ...(typeof totalHits === 'number' ? { totalCount: totalHits } : {}),
      ...(pageSize < requested ? { pageSize } : {}),
    })
    return (res.issues ?? []).map(transformTicket)
  }

  /**
   * GET /issues/{issue-id}, per https://developers.helpshift.com/rest-api/scenarios/:
   * "Using the /issues/ {issue-id} request, developers are able to extract a
   * single issue by passing the issue-id into the path of the request." The
   * documented response is the list envelope: { "page", "page-size",
   * "issues": [ { ... } ], "total-hits", "total-pages" }.
   */
  private async fetchIssue(credentials: Credentials, id: string): Promise<RawHelpshiftIssue> {
    const res = await this.client(credentials).get<IssuesResponse>(
      `/issues/${encodeURIComponent(id)}`,
    )
    const issue = res.issues?.[0]
    if (!issue) throw new Error(`Helpshift issue ${id} not found`)
    return issue
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    return transformTicket(await this.fetchIssue(credentials, id))
  }

  // ── Messages (inline on the single issue; no separate list endpoint) ────────

  /**
   * The documented single-issue response carries the issue's whole `messages`
   * array, so every message is in hand and is paged locally.
   */
  async listMessages(
    credentials: Credentials,
    ticketId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    const issue = await this.fetchIssue(credentials, ticketId)
    const messages = (issue.messages ?? []) as RawHelpshiftMessage[]
    return pageLocally(
      messages.map((m) => transformMessage(m, ticketId)),
      params,
    )
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(`Helpshift messages are issue-scoped; call listMessages(ticketId). id=${id}`)
  }

  // ── Contacts (End-users) ────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const res = await this.client(credentials).get<UsersResponse>('/users', this.listParams(params))
    return (res.users ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<{ user?: RawHelpshiftUser }>(`/users/${id}`)
    if (!res.user) throw new Error(`Helpshift user ${id} not found`)
    return transformContact(res.user)
  }

  // ── Users (Agents) ──────────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const res = await this.client(credentials).get<AgentsResponse>(
      '/agents',
      this.listParams(params),
    )
    return (res.agents ?? []).map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<{ agent?: RawHelpshiftAgent }>(`/agents/${id}`)
    if (!res.agent) throw new Error(`Helpshift agent ${id} not found`)
    return transformUser(res.agent)
  }

  // ── Tags ────────────────────────────────────────────────────────────────────

  /**
   * Helpshift documents no tag resource: the "Main REST Endpoints" list at
   * https://developers.helpshift.com/rest-api/getting-started/ names Issues,
   * FAQs, Sections, Apps, Users and Agents only. Tags exist only as strings on
   * issues, and de-duplicating one issues page is not the tag list.
   */
  async listTags(_credentials: Credentials, _params: QueryParams): Promise<Tag[]> {
    throw notSupported(`Helpshift cannot list tags: ${NO_TAG_ENDPOINT}`)
  }

  async getTag(_credentials: Credentials, _id: string): Promise<Tag> {
    throw notSupported(`Helpshift cannot read a tag: ${NO_TAG_ENDPOINT}`)
  }
}

const NO_TAG_ENDPOINT =
  'its REST API documents no tag endpoint ("Main REST Endpoints": Issues, FAQs, Sections, Apps, Users, Agents)'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}
