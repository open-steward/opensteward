/**
 * Khoros Care adapter for the customer-support vertical.
 *
 * Khoros Care is a social/digital customer service platform. This adapter
 * integrates with the Care API v2, which uses HTTP Basic Authentication.
 * Per-instance base URL: https://{instance}.response.lithium.com/api/v2
 *
 * Served: Tags, Teams (work queues), Contacts (author handles), a ticket
 * (conversation) by id and its Messages. Refused: listing tickets (the
 * Conversation API needs a filter) and users (no agent API beyond states).
 *
 * Docs: https://developer.khoros.com/khoroscaredevdocs/reference/care-apis
 */
import {
  connectionScope,
  pageByRows,
  pageLocally,
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
import type { Team } from '../../schema/team'

import {
  credentialFields as careCredentialFields,
  exchangeCredentials as careExchangeCredentials,
  refreshCredentials as careRefreshCredentials,
} from './auth'
import { KhorosCareClient } from './client'

import { transformTicket, type RawKhorosCareConversation } from './transform/ticket'
import { transformMessage } from './transform/message'
import { personHandles, transformContact, type RawKhorosCarePerson } from './transform/contact'
import { transformTag, type RawKhorosCareTag } from './transform/tag'
import { transformTeam, type RawKhorosCareWorkQueue } from './transform/team'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface KhorosCareAdapterConfig {
  // No OAuth2 client credentials required; all auth is via Basic Auth
  // credential fields collected via credentialFields()
}

// ── API response envelopes (as documented) ────────────────────────────────────

/** GET /api/v2/conversations/{lswUuid} → { status, data: [conversation] } */
interface ConversationResponse {
  status?: string
  data?: RawKhorosCareConversation[]
}

/** GET /api/v2/authors → { status, data: { nextPageUrl, personList } } */
interface AuthorsResponse {
  status?: string
  data?: { nextPageUrl?: string; personList?: RawKhorosCarePerson[] }
}

/** GET /api/v2/authors/{lswUuid} → { status, data: [person] } */
interface AuthorResponse {
  status?: string
  data?: RawKhorosCarePerson[]
}

/** GET /api/v2/tags → { status, data: [tag] } */
interface TagsResponse {
  status?: string
  data?: RawKhorosCareTag[]
}

/** GET /api/v2/workqueues/active → { data: [workQueue] } */
interface WorkQueuesResponse {
  data?: RawKhorosCareWorkQueue[]
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404, code: 'NOT_FOUND' })
}

/**
 * The query of an authors `nextPageUrl`, to be sent back verbatim ("Changing
 * the offset in `nextPageUrl` is not supported"). Only the path is checked,
 * and the request goes to the connection's own instance, so the Basic
 * credentials never follow a host named in a response.
 */
function authorsNextQuery(nextPageUrl: string): Record<string, string> {
  const url = new URL(nextPageUrl)
  if (!/\/api\/v2\/authors\/?$/.test(url.pathname)) {
    throw new Error(`Khoros Care authors nextPageUrl names an unexpected path: ${url.pathname}`)
  }
  return Object.fromEntries(url.searchParams)
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class KhorosCareAdapter implements CustomerSupportAdapter {
  readonly platform = 'khoros-care'
  readonly version = '0.1.0'

  constructor(_config?: KhorosCareAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return careCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return careExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error('khoros-care uses Basic Auth; use credentialFields() instead of OAuth2 flow')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('khoros-care uses Basic Auth; use credentialFields() instead of OAuth2 flow')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return careRefreshCredentials(credentials)
  }

  private client(credentials: Credentials): KhorosCareClient {
    return new KhorosCareClient(credentials)
  }

  private async conversation(
    credentials: Credentials,
    id: string,
  ): Promise<RawKhorosCareConversation> {
    const res = await this.client(credentials).get<ConversationResponse>(
      `/conversations/${encodeURIComponent(id)}`,
    )
    const item = res.data?.[0]
    if (!item) throw notFound(`Khoros Care conversation ${id} not found`)
    return item
  }

  // ── Tickets (conversations) ─────────────────────────────────────────────────

  async listTickets(_credentials: Credentials, _params: QueryParams): Promise<Ticket[]> {
    // developer.khoros.com/khoroscaredevdocs/reference/reference-conversation-api
    // Conversations are read by id only. The per-author routes
    // (/authors/{lswUuid}/conversations and the /authors/networks/... forms)
    // "return the IDs for conversations associated with a specified author
    // during a specified time range up to 24 hours" (about-conversation-ids),
    // so a list would be a fan-out per author, per 24-hour window, per
    // conversation detail, not a page of one collection.
    throw notSupported(
      'Khoros Care cannot list conversations: "Retrieving conversations requires a filter, such as an author or conversation ID."',
    )
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    return transformTicket(await this.conversation(credentials, id))
  }

  // ── Messages ────────────────────────────────────────────────────────────────

  async listMessages(
    credentials: Credentials,
    ticketId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    // Messages are part of the conversation detail (data[0].messages), which
    // returns all of them at once and takes no paging parameter.
    const conv = await this.conversation(credentials, ticketId)
    const rows = (conv.messages ?? []).map((m) => transformMessage(m, ticketId))
    return pageLocally(rows, params)
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(
      `Khoros Care messages are conversation-scoped; call listMessages(ticketId). id=${id}`,
    )
  }

  // ── Contacts (author handles) ───────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    // GET /api/v2/authors documents only `offset` and `include_deleted_crm`
    // (no page size) and pages by `data.nextPageUrl`, present "if paging is
    // required". Each person's handles are flattened into Contacts, so the
    // caller's page is cut out of the upstream pages by row count.
    const client = this.client(credentials)
    const key = `${connectionScope(client.instance, credentials)}::khoros-care::authors`
    const { items } = await pageByRows<Contact, Record<string, string>>(
      key,
      params,
      async (query) => {
        const res = await client.get<AuthorsResponse>('/authors', query)
        const rows = (res.data?.personList ?? []).flatMap((person) =>
          personHandles(person).map(({ network, handle }) =>
            transformContact(handle, network, person),
          ),
        )
        const next = res.data?.nextPageUrl
        return { items: rows, next: next ? authorsNextQuery(next) : undefined }
      },
    )
    return items
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<AuthorResponse>(
      `/authors/${encodeURIComponent(id)}`,
    )
    for (const person of res.data ?? []) {
      for (const { network, handle } of personHandles(person)) {
        if (handle.lswUuid === id) return transformContact(handle, network, person)
      }
    }
    throw notFound(`Khoros Care author ${id} not found`)
  }

  // ── Users (agents) ──────────────────────────────────────────────────────────

  async listUsers(_credentials: Credentials, _params: QueryParams): Promise<User[]> {
    // developer.khoros.com/khoroscaredevdocs/reference/agent-states-api-v2
    throw notSupported(
      'Khoros Care cannot list agents: the Care API documents no agent resource, only Agent States ("retrieve a list of defined Agent states and to set states on active Agents externally").',
    )
  }

  async getUser(_credentials: Credentials, id: string): Promise<User> {
    throw notSupported(
      `Khoros Care cannot read agent ${id}: the Care API documents no agent resource, only Agent States.`,
    )
  }

  // ── Tags ────────────────────────────────────────────────────────────────────

  async listTags(credentials: Credentials, params: QueryParams): Promise<Tag[]> {
    // GET /api/v2/tags declares no query parameters and returns every tag in
    // `data` (developer.khoros.com/khoroscaredevdocs/reference/tags), so the
    // whole collection is fetched once and the caller's page sliced from it.
    const res = await this.client(credentials).get<TagsResponse>('/tags')
    return pageLocally(res.data ?? [], params).map(transformTag)
  }

  async getTag(_credentials: Credentials, id: string): Promise<Tag> {
    throw new Error(`Khoros Care tags do not have an individual get endpoint. id=${id}`)
  }

  // ── Teams (work queues) ─────────────────────────────────────────────────────

  private async workQueues(credentials: Credentials): Promise<RawKhorosCareWorkQueue[]> {
    // GET /api/v2/workqueues/active: "a list of all non-archived work queues
    // and their IDs"; no parameters, the whole list in `data`.
    const res = await this.client(credentials).get<WorkQueuesResponse>('/workqueues/active')
    return res.data ?? []
  }

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    return pageLocally(await this.workQueues(credentials), params).map(transformTeam)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    // No work queue is documented by id; read it from the documented list.
    const wq = (await this.workQueues(credentials)).find((q) => String(q.id) === id)
    if (!wq) throw notFound(`Khoros Care work queue ${id} not found among active work queues`)
    return transformTeam(wq)
  }

  // ── Macros — not supported by Khoros Care ───────────────────────────────────
  // listMacros / getMacro are intentionally omitted; the base interface marks
  // them optional, so the server will return 501 for those routes automatically.
}
