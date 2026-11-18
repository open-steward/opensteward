/**
 * Zenvia Customer Cloud adapter.
 *
 * Zenvia Customer Cloud is a Brazilian omnichannel CRM/customer-service
 * platform.  The REST API (https://sales.zenvia.com/api/v1) exposes:
 *   - Prospects     → Contacts
 *   - Interactions  → Tickets  (customer-service sessions)
 *   - Agents        → Users
 *   - Groups        → Teams
 *   - Webhooks      → Webhook subscriptions (prospects, interactions, agents)
 *
 * Authentication: static API key sent as `api-key` query parameter.
 * Rate limit: 200 RPM per key.
 * Pagination: GET /prospects and GET /prospects/interactions take `limit`
 * and `before` / `after` ObjectId parameters and return rows "sorted by
 * descending creation date", so the next page is `before=<last row's id>`.
 * GET /prospect/{id}/interactions, /agents and /groups document no paging
 * parameter and are sliced locally.
 *
 * Schema-firewall: no attachment content, no voice-recording bytes,
 * no AI-generated summaries, contact PII = email + name + phone only.
 *
 * Docs: https://sales.zenvia.com/
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: macro — Zenvia Customer Cloud exposes no canned-response/macro concept via its REST API (sales.zenvia.com/api/v1 spec has no /macros endpoint)
// Unavailable: tag   — Tags are a UI-only feature; the REST API (sales.zenvia.com/api/v1) exposes no /tags endpoint for listing or retrieving tag definitions

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
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
import type { Team } from '../../schema/team'

import {
  credentialFields as zenviaCredentialFields,
  exchangeCredentials as zenviaExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { ZenviaClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformTicket, type RawZenviaInteraction } from './transform/ticket'
import { transformMessage, type RawZenviaMessage } from './transform/message'
import { transformContact, type RawZenviaProspect } from './transform/contact'
import { transformUser, type RawZenviaAgent } from './transform/user'
import { transformTeam, type RawZenviaGroup } from './transform/team'

// ── Response envelope types ────────────────────────────────────────────────

/** A list body: the documented bare array, or a tolerated envelope. */
type ListBody<T> = T[] | { data?: T[]; results?: T[] }

interface ProspectResponse {
  data?: RawZenviaProspect
}

type InteractionsResponse = ListBody<RawZenviaInteraction>
type MessagesResponse = ListBody<RawZenviaMessage>

type AgentsResponse = ListBody<RawZenviaAgent>

type GroupsResponse = ListBody<RawZenviaGroup>

interface GroupResponse {
  data?: RawZenviaGroup
}

// ── Adapter config ─────────────────────────────────────────────────────────

export interface ZenviaAdapterConfig {
  /** Not used at runtime — kept for interface parity with OAuth adapters. */
  clientId?: string
  clientSecret?: string
  redirectUri?: string
}

// ── Adapter ────────────────────────────────────────────────────────────────

export class ZenviaAdapter implements CustomerSupportAdapter {
  readonly platform = 'zenvia'
  readonly version = '0.1.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  constructor(_config: ZenviaAdapterConfig = {}) {}

  credentialFields(): CredentialField[] {
    return zenviaCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return zenviaExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('zenvia uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys do not expire
    return credentials
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private client(credentials: Credentials): ZenviaClient {
    return new ZenviaClient(credentials)
  }

  /** The caller's limit, clamped to the documented ceiling of 1000. */
  private pageSize(params: QueryParams): number {
    return Math.min(Math.max(1, Math.floor(params.limit ?? DEFAULT_PAGE_SIZE)), MAX_PAGE_SIZE)
  }

  /**
   * One caller page of GET /prospects or GET /prospects/interactions.
   *
   * Docs (https://sales.zenvia.com/): `before` "Limits the results only to
   * the prospects created before the one provided in this parameter (not
   * included)"; `limit` is "The maximum number of items that must be
   * returned"; the response is "An array of ... sorted by descending creation
   * date". So page N+1 is `before=<id of page N's last row>`, and a page
   * shorter than `limit` is the last. No next link or total is returned.
   */
  private async cursorList<R extends { id?: unknown }>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
  ): Promise<R[]> {
    const client = this.client(credentials)
    const limit = this.pageSize(params)
    const key = cursorPagerKey(connectionScope('zenvia', credentials), path, { limit })
    const result = await pageByCursor<R, string>(key, params.page, async (before) => {
      const res = await client.get<ListBody<R>>(path, {
        limit,
        ...(before !== undefined ? { before } : {}),
      })
      const items = this.unwrapList(res)
      const lastId = items[items.length - 1]?.id
      const next = items.length >= limit && lastId != null ? String(lastId) : null
      return { items, next }
    })
    reportUpstreamPage(params, { hasMore: result.hasMore })
    return result.items
  }

  /**
   * Unwrap the list. The API reference documents a bare JSON array; the
   * `data` / `results` envelopes are kept as tolerated alternatives.
   */
  private unwrapList<T>(res: ListBody<T>): T[] {
    if (Array.isArray(res)) return res
    return res.data ?? res.results ?? []
  }

  // ── Tickets (Interactions) ───────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const rows = await this.cursorList<RawZenviaInteraction>(
      credentials,
      '/prospects/interactions',
      params,
    )
    return rows.map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    // Zenvia does not expose a single-interaction GET by id; we fall back to
    // listing the prospect's interactions and finding the matching one.
    // The caller should supply a compound id: "{prospectId}:{interactionId}".
    const [prospectId, interactionId] = id.includes(':')
      ? id.split(':')
      : [id, id]
    const res = await this.client(credentials).get<InteractionsResponse>(
      `/prospect/${prospectId}/interactions`,
      {},
    )
    const list = this.unwrapList(res)
    // If we have an interactionId qualifier, look for an exact match;
    // otherwise return the most recent interaction.
    const raw =
      interactionId !== prospectId
        ? list.find((i) => String(i.id) === interactionId)
        : list[0]
    if (!raw) throw new Error(`zenvia: interaction ${id} not found`)
    return transformTicket(raw)
  }

  // ── Messages ─────────────────────────────────────────────────────────────

  async listMessages(
    credentials: Credentials,
    ticketId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    // ticketId is either a bare prospectId, or "prospectId:interactionId".
    const parts = ticketId.includes(':') ? ticketId.split(':') : [ticketId, null]
    const prospectId = parts[0] ?? ticketId
    const interactionId = parts[1] ?? null
    // GET /prospect/{prospectId}/interactions documents no paging parameter
    // (only status, date and via filters): it returns the whole list, which
    // is sliced locally below.
    const res = await this.client(credentials).get<MessagesResponse>(
      `/prospect/${prospectId}/interactions`,
      {},
    )
    // When ticketId encodes a specific interactionId, only return the
    // message for that interaction, not all interactions of the prospect.
    const interactions = this.unwrapList(res)
    const scoped = interactionId
      ? interactions.filter((i) => String(i.id) === interactionId)
      : interactions
    // Each interaction output is surfaced as a message.
    return pageLocally(scoped, params).map((item) => {
      // Infer direction from the interaction's via / proactive flag.
      // outboundCall or proactive=true means agent-initiated (outbound → 'user');
      // all other channels are customer-initiated (inbound → 'contact').
      const via = pickStr(item.via) ?? ''
      const isProactive = Boolean((item as Record<string, unknown>)['proactive'])
      const direction =
        via === 'outboundCall' || isProactive ? 'outbound' : 'inbound'
      const msg: RawZenviaMessage = {
        id: String(item.id),
        interactionId: String(item.id),
        prospectId: pickStr(item.prospectId),
        agentId: pickStr(item.agentId),
        via,
        direction,
        content:
          pickStr((item.output as Record<string, unknown> | null | undefined)?.['message']) ??
          pickStr((item.output as Record<string, unknown> | null | undefined)?.['comment']) ??
          '',
        type: 'text',
        isInternal: false,
        createdAt: pickStr(item.createdAt),
      }
      return transformMessage(msg, ticketId)
    })
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(
      `zenvia: messages are prospect-scoped; call listMessages(prospectId). id=${id}`,
    )
  }

  // ── Contacts (Prospects) ─────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const rows = await this.cursorList<RawZenviaProspect>(credentials, '/prospects', params)
    return rows.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<ProspectResponse>(`/prospect/${id}`)
    const raw = res.data ?? (res as unknown as RawZenviaProspect)
    if (!raw || !('id' in (raw as object))) throw new Error(`zenvia: prospect ${id} not found`)
    return transformContact(raw as RawZenviaProspect)
  }

  // ── Users (Agents) ───────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    // GET /agents documents only `group`, `active` and `format`: no paging.
    const res = await this.client(credentials).get<AgentsResponse>('/agents', {})
    return pageLocally(this.unwrapList(res), params).map(transformUser)
  }

  async getUser(_credentials: Credentials, id: string): Promise<User> {
    throw new Error(
      `zenvia: agents are group-scoped; call listUsers() to enumerate. id=${id}`,
    )
  }

  // ── Teams (Groups) ───────────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    // GET /groups documents no query parameter: it returns every group.
    const res = await this.client(credentials).get<GroupsResponse>('/groups', {})
    return pageLocally(this.unwrapList(res), params).map(transformTeam)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const res = await this.client(credentials).get<GroupResponse>(`/group/${id}`)
    const raw = res.data ?? (res as unknown as RawZenviaGroup)
    if (!raw || !('id' in (raw as object))) throw new Error(`zenvia: group ${id} not found`)
    return transformTeam(raw as RawZenviaGroup)
  }

}

// ── private helper (module-level, avoids import of transform/shared in index) ──
function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string' && v.length > 0) return v
  if (v == null) return undefined
  return String(v)
}
