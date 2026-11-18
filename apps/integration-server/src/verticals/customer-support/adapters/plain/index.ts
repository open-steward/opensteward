/**
 * Plain adapter for the customer-support vertical.
 *
 * Plain is a GraphQL-native support platform. Its core concepts:
 *   - Threads        → canonical Tickets
 *   - Timeline entries → canonical Messages
 *   - Customers      → canonical Contacts
 *   - Label types    → canonical Tags
 *   - Snippets       → canonical Macros (canned responses)
 *   - Users          → canonical Users  (agents)
 *
 * Auth: API key (Bearer token).
 * Docs: https://www.plain.com/docs/graphql/introduction
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: team — Plain has no teams concept; the schema exposes
 *   teamSettings only as configuration tied to label types, not a
 *   listable collection of team entities.
 */
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  reportUpstreamPage,
  type Credentials,
  type CredentialField,
  type QueryParams,
} from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Message } from '../../schema/message'
import type { Contact } from '../../schema/contact'
import type { Tag } from '../../schema/tag'
import type { User } from '../../schema/user'
import type { Macro } from '../../schema/macro'
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { PlainClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { verifyPlainWebhook, parsePlainWebhookEvents } from './webhook'

import { transformTicket, type RawPlainThread } from './transform/ticket'
import { transformMessage, type RawPlainTimelineEntry } from './transform/message'
import { transformContact, type RawPlainCustomer } from './transform/contact'
import { transformTag, type RawPlainLabelType } from './transform/tag'
import { transformUser, type RawPlainUser } from './transform/user'
import { transformMacro, type RawPlainSnippet } from './transform/macro'

// ── GraphQL query definitions ────────────────────────────────────────────────

const THREAD_FIELDS = /* GraphQL */ `
  id
  externalId
  title
  status
  priority
  customer { id }
  assignee { ... on UserActor { userId } ... on MachineUserActor { machineUserId } }
  labels { id labelType { id name } }
  createdAt { iso8601 }
  updatedAt { iso8601 }
  resolvedAt { iso8601 }
`

const LIST_THREADS_QUERY = /* GraphQL */ `
  query ListThreads($first: Int!, $after: String) {
    threads(first: $first, after: $after) {
      edges { node { ${THREAD_FIELDS} } }
      pageInfo { endCursor hasNextPage }
    }
  }
`

const GET_THREAD_QUERY = /* GraphQL */ `
  query GetThread($threadId: ID!) {
    thread(threadId: $threadId) { ${THREAD_FIELDS} }
  }
`

const LIST_TIMELINE_ENTRIES_QUERY = /* GraphQL */ `
  query ListTimelineEntries($threadId: ID!, $first: Int!, $after: String) {
    thread(threadId: $threadId) {
      timelineEntries(first: $first, after: $after) {
        edges {
          node {
            id
            timestamp { iso8601 }
            ... on CustomerEmailItem {
              type: __typename
              textContent
              customerActor { customerId }
            }
            ... on CustomerChatItem {
              type: __typename
              text { value }
              customerActor { customerId }
            }
            ... on AgentEmailItem {
              type: __typename
              textContent
              userActor { userId }
            }
            ... on AgentChatItem {
              type: __typename
              text { value }
              userActor { userId }
            }
            ... on NoteItem {
              type: __typename
              text { value }
              userActor { userId }
              machineUserActor { machineUserId }
            }
          }
        }
        pageInfo { endCursor hasNextPage }
      }
    }
  }
`

const CUSTOMER_FIELDS = /* GraphQL */ `
  id
  externalId
  fullName
  shortName
  email { email isVerified }
  phone { phoneNumber }
  company { id }
  createdAt { iso8601 }
  updatedAt { iso8601 }
`

const LIST_CUSTOMERS_QUERY = /* GraphQL */ `
  query ListCustomers($first: Int!, $after: String) {
    customers(first: $first, after: $after) {
      edges { node { ${CUSTOMER_FIELDS} } }
      pageInfo { endCursor hasNextPage }
    }
  }
`

const GET_CUSTOMER_QUERY = /* GraphQL */ `
  query GetCustomer($customerId: ID!) {
    customer(customerId: $customerId) { ${CUSTOMER_FIELDS} }
  }
`

const LIST_LABEL_TYPES_QUERY = /* GraphQL */ `
  query ListLabelTypes($first: Int!, $after: String) {
    labelTypes(first: $first, after: $after) {
      edges { node { id name externalId color isArchived } }
      pageInfo { endCursor hasNextPage }
    }
  }
`

const GET_LABEL_TYPE_QUERY = /* GraphQL */ `
  query GetLabelType($labelTypeId: ID!) {
    labelType(labelTypeId: $labelTypeId) { id name externalId color isArchived }
  }
`

const SNIPPET_FIELDS = /* GraphQL */ `
  id
  name
  text
  markdown
  path
  isDeleted
  createdAt { iso8601 }
  updatedAt { iso8601 }
`

const LIST_SNIPPETS_QUERY = /* GraphQL */ `
  query ListSnippets($first: Int!, $after: String) {
    snippets(first: $first, after: $after) {
      edges { node { ${SNIPPET_FIELDS} } }
      pageInfo { endCursor hasNextPage }
    }
  }
`

const GET_SNIPPET_QUERY = /* GraphQL */ `
  query GetSnippet($snippetId: ID!) {
    snippet(snippetId: $snippetId) { ${SNIPPET_FIELDS} }
  }
`

const USER_FIELDS = /* GraphQL */ `
  id
  fullName
  publicName
  email
  roles { id name key }
  status
  isDeleted
  createdAt { iso8601 }
  updatedAt { iso8601 }
`

const LIST_USERS_QUERY = /* GraphQL */ `
  query ListUsers($first: Int!, $after: String) {
    users(first: $first, after: $after) {
      edges { node { ${USER_FIELDS} } }
      pageInfo { endCursor hasNextPage }
    }
  }
`

const GET_USER_QUERY = /* GraphQL */ `
  query GetUser($userId: ID!) {
    user(userId: $userId) { ${USER_FIELDS} }
  }
`

// ── Response shape helpers ───────────────────────────────────────────────────

interface PageInfo { endCursor?: string | null; hasNextPage?: boolean }
interface Edge<T> { node: T }
interface Connection<T> { edges?: Edge<T>[]; pageInfo?: PageInfo }

interface ThreadsResponse { threads?: Connection<RawPlainThread> }
interface ThreadResponse  { thread?: RawPlainThread | null }
interface TimelineResponse {
  thread?: {
    timelineEntries?: Connection<RawPlainTimelineEntry>
  } | null
}
interface CustomersResponse { customers?: Connection<RawPlainCustomer> }
interface CustomerResponse  { customer?: RawPlainCustomer | null }
interface LabelTypesResponse { labelTypes?: Connection<RawPlainLabelType> }
interface LabelTypeResponse  { labelType?: RawPlainLabelType | null }
interface SnippetsResponse { snippets?: Connection<RawPlainSnippet> }
interface SnippetResponse  { snippet?: RawPlainSnippet | null }
interface UsersResponse { users?: Connection<RawPlainUser> }
interface UserResponse  { user?: RawPlainUser | null }

// ── Adapter class ────────────────────────────────────────────────────────────

// Plain uses static API key auth; no OAuth client credentials needed.
export type PlainAdapterConfig = Record<string, never>

export class PlainAdapter implements CustomerSupportAdapter {
  readonly platform = 'plain'
  readonly version = '0.1.0'
  /**
   * "We will return 25 records per request by default and the maximum page
   * size is 100 records." — https://www.plain.com/docs/graphql/pagination.
   * Every list method pages by cursor at the requested size and reports its end.
   */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  constructor(_config?: PlainAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return adapterCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return adapterExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('plain uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyPlainWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parsePlainWebhookEvents(payload)
  }

  private client(credentials: Credentials): PlainClient {
    return new PlainClient(credentials)
  }

  private pageSize(params: QueryParams): number {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    return Math.min(limit, MAX_PAGE_SIZE)
  }

  /**
   * One caller page of a Plain connection. Plain pages forward with `first`
   * (count) and `after` (cursor) and answers with `pageInfo { endCursor
   * hasNextPage }` (https://www.plain.com/docs/graphql/pagination). The
   * caller's 1-based `page` resolves through the shared cursor pager, so page
   * N follows the `endCursor` chain from page 1. An explicit caller `cursor`
   * is one request at that position. Either way the page's end is reported.
   */
  private async cursorPage<R, N, T>(
    credentials: Credentials,
    collection: string,
    query: string,
    vars: Record<string, unknown>,
    params: QueryParams,
    connection: (res: R) => Connection<N> | undefined,
    map: (node: N) => T,
  ): Promise<T[]> {
    const client = this.client(credentials)
    const first = this.pageSize(params)
    const fetchPage = async (after: string | undefined) => {
      const res = await client.query<R>(query, {
        ...vars,
        first,
        ...(after !== undefined ? { after } : {}),
      })
      const conn = connection(res)
      const info = conn?.pageInfo
      const next = info?.hasNextPage === true && info.endCursor ? info.endCursor : undefined
      return { items: (conn?.edges ?? []).map((e) => map(e.node)), next }
    }
    const explicit = params['cursor'] ? String(params['cursor']) : undefined
    if (explicit !== undefined) {
      const one = await fetchPage(explicit)
      reportUpstreamPage(params, { hasMore: one.next !== undefined, pageSize: first })
      return one.items
    }
    const key = cursorPagerKey(connectionScope('plain', credentials), collection, {
      ...vars,
      limit: first,
    })
    const result = await pageByCursor<T, string>(key, params.page, fetchPage)
    reportUpstreamPage(params, { hasMore: result.hasMore, pageSize: first })
    return result.items
  }

  // ── Tickets (threads) ──────────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    return this.cursorPage(
      credentials,
      'threads',
      LIST_THREADS_QUERY,
      {},
      params,
      (res: ThreadsResponse) => res.threads,
      (n) => transformTicket(n),
    )
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).query<ThreadResponse>(
      GET_THREAD_QUERY,
      { threadId: id },
    )
    if (!res.thread) throw new Error(`Plain thread ${id} not found`)
    return transformTicket(res.thread)
  }

  // ── Messages (timeline entries) ────────────────────────────────────────────

  async listMessages(credentials: Credentials, ticketId: string, params: QueryParams): Promise<Message[]> {
    return this.cursorPage(
      credentials,
      'timelineEntries',
      LIST_TIMELINE_ENTRIES_QUERY,
      { threadId: ticketId },
      params,
      (res: TimelineResponse) => res.thread?.timelineEntries,
      (n) => transformMessage(n, ticketId),
    )
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(`Plain timeline entries are thread-scoped; call listMessages(ticketId). id=${id}`)
  }

  // ── Contacts (customers) ───────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    return this.cursorPage(
      credentials,
      'customers',
      LIST_CUSTOMERS_QUERY,
      {},
      params,
      (res: CustomersResponse) => res.customers,
      (n) => transformContact(n),
    )
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).query<CustomerResponse>(
      GET_CUSTOMER_QUERY,
      { customerId: id },
    )
    if (!res.customer) throw new Error(`Plain customer ${id} not found`)
    return transformContact(res.customer)
  }

  // ── Tags (label types) ─────────────────────────────────────────────────────

  async listTags(credentials: Credentials, params: QueryParams): Promise<Tag[]> {
    return this.cursorPage(
      credentials,
      'labelTypes',
      LIST_LABEL_TYPES_QUERY,
      {},
      params,
      (res: LabelTypesResponse) => res.labelTypes,
      (n) => transformTag(n),
    )
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    const res = await this.client(credentials).query<LabelTypeResponse>(
      GET_LABEL_TYPE_QUERY,
      { labelTypeId: id },
    )
    if (!res.labelType) throw new Error(`Plain label type ${id} not found`)
    return transformTag(res.labelType)
  }

  // ── Macros (snippets / canned responses) ──────────────────────────────────

  async listMacros(credentials: Credentials, params: QueryParams): Promise<Macro[]> {
    return this.cursorPage(
      credentials,
      'snippets',
      LIST_SNIPPETS_QUERY,
      {},
      params,
      (res: SnippetsResponse) => res.snippets,
      (n) => transformMacro(n),
    )
  }

  async getMacro(credentials: Credentials, id: string): Promise<Macro> {
    const res = await this.client(credentials).query<SnippetResponse>(
      GET_SNIPPET_QUERY,
      { snippetId: id },
    )
    if (!res.snippet) throw new Error(`Plain snippet ${id} not found`)
    return transformMacro(res.snippet)
  }

  // ── Users (agents) ─────────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    return this.cursorPage(
      credentials,
      'users',
      LIST_USERS_QUERY,
      {},
      params,
      (res: UsersResponse) => res.users,
      (n) => transformUser(n),
    )
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).query<UserResponse>(
      GET_USER_QUERY,
      { userId: id },
    )
    if (!res.user) throw new Error(`Plain user ${id} not found`)
    return transformUser(res.user)
  }
}
