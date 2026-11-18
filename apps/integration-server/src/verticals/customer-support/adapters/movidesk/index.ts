/**
 * Movidesk (Zenvia Service) adapter for the customer-support vertical.
 *
 * Auth: static API key passed as `?token=<key>` query param.
 * Base URL: https://api.movidesk.com/public/v1
 * Pagination: OData $top / $skip (max 1000 per request; no $count, no next link).
 *
 * Supported resources:
 *   - Tickets  (GET /tickets with $expand=clients,owner,actions)
 *   - Messages (a ticket's actions, read from GET /tickets?id=<ticket>)
 *   - Contacts (GET /persons?profileType eq 2)
 *   - Users    (GET /persons?profileType eq 1)
 *   - Tags     (GET /services — service catalog surfaced as tags)
 *   - Webhooks (trigger-based; no HMAC signature)
 *
 * Not supported (no public API):
 *   - Teams  (teams are embedded on persons only; no standalone list endpoint)
 *   - Macros (no equivalent concept in Movidesk)
 */
import {
  pageLocally,
  pageOffset,
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
import { MovideskClient } from './client'
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  TICKETS_PATH,
  PERSONS_PATH,
  SERVICES_PATH,
  PROFILE_TYPE_AGENT,
  PROFILE_TYPE_CLIENT,
} from './constants'
import { verifyMovideskWebhook, parseMovideskWebhookEvents } from './webhook'

import { transformTicket, type RawMovideskTicket } from './transform/ticket'
import { transformMessage, type RawMovideskAction } from './transform/message'
import { transformContact, type RawMovideskContactPerson } from './transform/contact'
import { transformUser, type RawMovideskAgent } from './transform/user'
import { transformTag, type RawMovideskService } from './transform/tag'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MovideskAdapterConfig {}

export class MovideskAdapter implements CustomerSupportAdapter {
  readonly platform = 'movidesk'
  readonly version = '0.1.0'

  constructor(_config?: MovideskAdapterConfig) {}

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
    throw new Error('movidesk uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyMovideskWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseMovideskWebhookEvents(payload)
  }

  private client(credentials: Credentials): MovideskClient {
    return new MovideskClient(credentials)
  }

  /**
   * One caller page of an OData collection (/tickets, /persons, /services).
   *
   * Movidesk documents `$top` and `$skip` ("utilizado para paginação do
   * retorno") with at most 1000 rows per request, and supports no `$count`,
   * so a page carries no total and no next link: a short page ends the list,
   * a full one says nothing either way.
   */
  private async odataPage<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    query: Record<string, unknown>,
  ): Promise<T[]> {
    const asked = Math.floor(Number(params.limit ?? DEFAULT_PAGE_SIZE))
    const size = Math.min(
      Number.isFinite(asked) && asked >= 1 ? asked : DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const skip = params['cursor'] ? Number(params['cursor']) : pageOffset(params, size)
    const res = await this.client(credentials).get<T[]>(path, { $top: size, $skip: skip, ...query })
    const rows = Array.isArray(res) ? res : []
    reportUpstreamPage(params, {
      pageSize: size,
      ...(rows.length < size ? { hasMore: false } : {}),
    })
    return rows
  }

  // ── Tickets ────────────────────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const res = await this.odataPage<RawMovideskTicket>(credentials, TICKETS_PATH, params, {
      $expand:
        'clients($select=id,businessName,email,phone,personType,profileType),owner($select=id,businessName,email,phone,personType,profileType)',
      $select:
        'id,protocol,type,subject,category,urgency,status,baseStatus,origin,createdDate,lastUpdate,resolvedIn,closedIn,owner,ownerTeam,createdBy,clients,serviceFirstLevel,serviceSecondLevel,serviceThirdLevel',
    })
    return res.map(transformTicket)
  }

  /**
   * One ticket, whole. The reference fetches a single ticket as `GET /tickets`
   * with the id as a query parameter ("Obtendo um único ticket — GET: /tickets
   * — Parâmetros: id / protocol, token"; example `/tickets?token=…&id=1`) and
   * returns every column of the layout, actions included. It names no
   * `/tickets/{id}` path and no $select/$expand on this form.
   */
  private async fetchTicket(credentials: Credentials, id: string): Promise<RawMovideskTicket> {
    const res = await this.client(credentials).get<RawMovideskTicket>(TICKETS_PATH, { id })
    if (!res || typeof res !== 'object' || Array.isArray(res)) {
      throw Object.assign(new Error(`Movidesk returned no ticket for id ${id}`), {
        statusCode: 404,
      })
    }
    return res
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    return transformTicket(await this.fetchTicket(credentials, id))
  }

  // ── Messages (ticket actions) ──────────────────────────────────────────────

  /**
   * A ticket's actions. Movidesk has no action endpoint: actions are a
   * collection on the ticket ("actions — Lista com as ações do ticket"), and
   * the single-ticket read returns all of them in one response, so the caller's
   * page is sliced locally from that whole list.
   */
  async listMessages(
    credentials: Credentials,
    ticketId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    const ticket = await this.fetchTicket(credentials, ticketId)
    const actions: RawMovideskAction[] = ticket.actions ?? []
    return pageLocally(
      actions.map((a) => transformMessage(a, ticketId)),
      params,
    )
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(
      `Movidesk actions are ticket-scoped; use listMessages(ticketId) instead. id=${id}`,
    )
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const res = await this.odataPage<RawMovideskContactPerson>(credentials, PERSONS_PATH, params, {
      $filter: `profileType eq ${PROFILE_TYPE_CLIENT}`,
      $expand: 'emails,contacts',
    })
    return res.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<RawMovideskContactPerson>(`${PERSONS_PATH}`, {
      id,
      $expand: 'emails,contacts',
    })
    return transformContact(res)
  }

  // ── Users (agents) ─────────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const res = await this.odataPage<RawMovideskAgent>(credentials, PERSONS_PATH, params, {
      $filter: `profileType eq ${PROFILE_TYPE_AGENT}`,
      $expand: 'emails,teams',
    })
    return res.map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<RawMovideskAgent>(`${PERSONS_PATH}`, {
      id,
      $expand: 'emails,teams',
    })
    return transformUser(res)
  }

  // ── Tags (service catalog) ─────────────────────────────────────────────────

  async listTags(credentials: Credentials, params: QueryParams): Promise<Tag[]> {
    const res = await this.odataPage<RawMovideskService>(credentials, SERVICES_PATH, params, {})
    return res.map(transformTag)
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    const res = await this.client(credentials).get<RawMovideskService>(`${SERVICES_PATH}`, {
      id,
    })
    return transformTag(res)
  }

  // ── Teams — not supported (no standalone endpoint) ─────────────────────────
  // ── Macros — not supported (no equivalent concept) ────────────────────────
}
