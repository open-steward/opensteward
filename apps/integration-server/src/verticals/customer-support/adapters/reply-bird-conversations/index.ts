/**
 * Bird customer-support adapter.
 *
 * API: https://bird.com/docs/api, spec https://bird.com/openapi.json.
 *   "Base path: all endpoints live under `/v1` on a regional host such as
 *    `https://us1.platform.bird.com`."
 * Auth: `Authorization: Bearer <bk_{region}_… key>`; the key prefix selects
 * the regional host (https://bird.com/docs/guides/authentication).
 * Paging (https://bird.com/docs/api/pagination): `limit` 1–100 (default 25)
 * and `starting_after` ← the previous response's `next_cursor`; "`null` when
 * no next page exists, which is the signal to stop."
 *
 * The adapter was written against the retired workspace API
 * (`api.bird.com/workspaces/{id}/…`, `AccessKey` auth), which Bird no longer
 * documents; docs.bird.com/api now redirects to https://bird.com/docs/api.
 * The current API serves conversations as email threads (`/v1/email/threads`,
 * tickets and their messages), custom mailbox labels (tags) and contacts. It
 * has no agent, team or macro endpoints, so those methods refuse with 501
 * before sending anything.
 */
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageByRows,
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
import type { Team } from '../../schema/team'
import type { Macro } from '../../schema/macro'
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { BirdClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { verifyBirdWebhook, parseBirdWebhookEvents } from './webhook'
import { transformContact, type RawBirdContact } from './transform/contact'
import { PLACEMENTS, transformTicket, type RawBirdThread } from './transform/ticket'
import { transformMessage, type RawBirdThreadMessage } from './transform/message'
import { parseLabelTagId, transformTag, type RawBirdLabel } from './transform/tag'

/** A `_ListEnvelope` list: `data` plus `next_cursor` ("`null` when no next page exists"). */
interface ListResponse<T> {
  data: T[]
  next_cursor: string | null
}

/** `Mailbox` (`GET /v1/email/mailboxes`): only its `id` ("Mailbox ID.") is read. */
interface RawBirdMailbox {
  id: string
}

/** Position in the ticket stream: which placement folder, and the cursor within it. */
interface ThreadCursor {
  placement: number
  after?: string
}

/** The caller's page size, clamped to the documented 1..100, reporting the size sent when it is below the ask. */
function upstreamLimit(params: QueryParams): number {
  const limit = Math.min(Math.max(1, Math.floor(params.limit ?? DEFAULT_PAGE_SIZE)), MAX_PAGE_SIZE)
  if (params.limit !== undefined && limit < params.limit)
    reportUpstreamPage(params, { pageSize: limit })
  return limit
}

/**
 * Refusal for a resource the current Bird API has no endpoint for. The spec at
 * https://bird.com/openapi.json lists every public path under `/v1` (contacts,
 * audiences, email, SMS, WhatsApp, voice, realtime, …) and none of them is an
 * agent, team or macro resource.
 */
function notSupported(resource: string, verb: 'list' | 'read' = 'list'): never {
  throw Object.assign(
    new Error(
      `Bird cannot ${verb} ${resource}: the Bird API (https://bird.com/openapi.json) documents no ${resource} endpoint; the workspace API this adapter used is no longer documented`,
    ),
    { statusCode: 501, code: 'NOT_SUPPORTED' },
  )
}

export class ReplyBirdConversationsAdapter implements CustomerSupportAdapter {
  readonly platform = 'reply-bird-conversations'
  readonly version = '0.2.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  constructor(_config?: Record<string, unknown>) {}

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
    throw new Error('Bird uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyBirdWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseBirdWebhookEvents(payload)
  }

  // ── Tickets (email threads) and their messages ────────────────────────────

  /**
   * `GET /v1/email/threads`: "Returns a paginated list of conversations across
   * the workspace's mailboxes, most recently active first. `label` selects the
   * view: the inbox (the default when omitted), `archive`, `spam`, `blocked`,
   * or any custom label."
   *
   * One unlabelled call returns the inbox only, and repeated `label`s are
   * ANDed ("only conversations that have every label you list are returned").
   * Every conversation carries exactly one placement label, so the whole
   * collection is the four placement folders walked one after another, each
   * with `label=<placement>`, `limit=100` and `starting_after`.
   */
  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const client = new BirdClient(credentials)
    const key = cursorPagerKey(connectionScope('bird', credentials), '/v1/email/threads', {
      label: PLACEMENTS.join(','),
      limit: MAX_PAGE_SIZE,
    })
    const result = await pageByRows<RawBirdThread, ThreadCursor>(
      key,
      params,
      async (cursor) => {
        const at = cursor ?? { placement: 0 }
        const res = await client.get<ListResponse<RawBirdThread>>('/v1/email/threads', {
          label: PLACEMENTS[at.placement],
          limit: MAX_PAGE_SIZE,
          ...(at.after ? { starting_after: at.after } : {}),
        })
        const next: ThreadCursor | undefined = res.next_cursor
          ? { placement: at.placement, after: res.next_cursor }
          : at.placement + 1 < PLACEMENTS.length
            ? { placement: at.placement + 1 }
            : undefined
        return { items: res.data ?? [], next }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return result.items.map(transformTicket)
  }

  /** `GET /v1/email/threads/{thread_id}`: "Returns a single conversation." */
  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const raw = await new BirdClient(credentials).get<RawBirdThread>(
      `/v1/email/threads/${encodeURIComponent(id)}`,
    )
    return transformTicket(raw)
  }

  /**
   * `GET /v1/email/threads/{thread_id}/messages`: "Returns the messages in a
   * conversation, newest first, both received and sent. To page through older
   * messages, use `starting_after`." Sends `limit`, `starting_after` and
   * `include=extracted_text` ("Set to `extracted_text` to inline each
   * message's extracted plain text").
   */
  async listMessages(
    credentials: Credentials,
    ticketId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    const client = new BirdClient(credentials)
    const limit = upstreamLimit(params)
    const path = `/v1/email/threads/${encodeURIComponent(ticketId)}/messages`
    const key = cursorPagerKey(connectionScope('bird', credentials), path, {
      limit,
      include: 'extracted_text',
    })
    const result = await pageByCursor<RawBirdThreadMessage, string>(
      key,
      params.page,
      async (cursor) => {
        const res = await client.get<ListResponse<RawBirdThreadMessage>>(path, {
          limit,
          include: 'extracted_text',
          ...(cursor ? { starting_after: cursor } : {}),
        })
        return { items: res.data, next: res.next_cursor }
      },
    )
    reportUpstreamPage(params, { hasMore: result.hasMore })
    return result.items.map(transformMessage)
  }

  // ── Contacts ─────────────────────────────────────────────────────────────

  /**
   * `GET /v1/contacts`: "Returns a paginated list of contacts in the
   * workspace, newest first." Only `limit` and `starting_after` are sent.
   */
  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new BirdClient(credentials)
    const limit = upstreamLimit(params)
    const key = cursorPagerKey(connectionScope('bird', credentials), '/v1/contacts', { limit })
    const result = await pageByCursor<RawBirdContact, string>(key, params.page, async (cursor) => {
      const res = await client.get<ListResponse<RawBirdContact>>('/v1/contacts', {
        limit,
        ...(cursor ? { starting_after: cursor } : {}),
      })
      return { items: res.data, next: res.next_cursor }
    })
    reportUpstreamPage(params, { hasMore: result.hasMore })
    return result.items.map(transformContact)
  }

  /** `GET /v1/contacts/{contact_id}`: "Returns a single contact". */
  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await new BirdClient(credentials).get<RawBirdContact>(
      `/v1/contacts/${encodeURIComponent(id)}`,
    )
    return transformContact(raw)
  }

  // ── Users / teams / macros (no documented endpoint) ──────────────────────

  async listUsers(_credentials: Credentials, _params: QueryParams): Promise<User[]> {
    return notSupported('agents')
  }

  async getUser(_credentials: Credentials, _id: string): Promise<User> {
    return notSupported('agents', 'read')
  }

  async listTeams(_credentials: Credentials, _params: QueryParams): Promise<Team[]> {
    return notSupported('teams')
  }

  async getTeam(_credentials: Credentials, _id: string): Promise<Team> {
    return notSupported('teams', 'read')
  }

  async listMacros(_credentials: Credentials, _params: QueryParams): Promise<Macro[]> {
    return notSupported('macros')
  }

  async getMacro(_credentials: Credentials, _id: string): Promise<Macro> {
    return notSupported('macros', 'read')
  }

  // ── Tags (custom mailbox labels) ─────────────────────────────────────────

  /**
   * Custom labels of every mailbox. `GET /v1/email/mailboxes` ("Returns a
   * paginated list of the workspace's mailboxes, newest first"; `limit`,
   * `starting_after`) is walked, and for each mailbox
   * `GET /v1/email/mailboxes/{mailbox_id}/labels` ("every custom label
   * currently in use on its conversations and messages"; no paging
   * parameters) is read, keeping `type: custom`. The labels are flattened
   * through pageByRows over the mailbox pages.
   */
  async listTags(credentials: Credentials, params: QueryParams): Promise<Tag[]> {
    const client = new BirdClient(credentials)
    const key = cursorPagerKey(connectionScope('bird', credentials), '/v1/email/mailboxes/labels', {
      limit: MAX_PAGE_SIZE,
    })
    const result = await pageByRows<Tag, string>(
      key,
      params,
      async (cursor) => {
        const res = await client.get<ListResponse<RawBirdMailbox>>('/v1/email/mailboxes', {
          limit: MAX_PAGE_SIZE,
          ...(cursor ? { starting_after: cursor } : {}),
        })
        const tags: Tag[] = []
        for (const mailbox of res.data ?? [])
          tags.push(...(await this.mailboxTags(client, mailbox.id)))
        return { items: tags, next: res.next_cursor }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return result.items
  }

  /** A tag id from listTags (`{mailbox_id}:{name}`), read back from that mailbox's labels. */
  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    const parsed = parseLabelTagId(id)
    if (!parsed)
      throw Object.assign(new Error(`Bird tag id must be {mailbox_id}:{label}, got ${id}`), {
        statusCode: 404,
        code: 'NOT_FOUND',
      })
    const tags = await this.mailboxTags(new BirdClient(credentials), parsed.mailboxId)
    const hit = tags.find((t) => t.name === parsed.name)
    if (!hit)
      throw Object.assign(
        new Error(`Bird mailbox ${parsed.mailboxId} has no custom label ${parsed.name}`),
        {
          statusCode: 404,
          code: 'NOT_FOUND',
        },
      )
    return hit
  }

  private async mailboxTags(client: BirdClient, mailboxId: string): Promise<Tag[]> {
    const res = await client.get<{ data: RawBirdLabel[] }>(
      `/v1/email/mailboxes/${encodeURIComponent(mailboxId)}/labels`,
    )
    return (res.data ?? [])
      .filter((l) => l.type === 'custom')
      .map((l) => transformTag(mailboxId, l))
  }
}
