/**
 * Odoo Helpdesk adapter, on the shared Odoo client (@opensteward/shared
 * adapter/odoo): JSON-2 on Odoo 19+, External RPC (/jsonrpc execute_kw) on
 * 14–18, as the connection chooses.
 *
 * Docs: https://www.odoo.com/documentation/19.0/developer/reference/external_api.html
 *   "Post a JSON object at the /json/2/<model>/<method> URL."
 *
 * Helpdesk is Odoo Enterprise only ("``helpdesk.ticket`` in the Helpdesk
 * (*helpdesk* - Odoo Enterprise only) Application", odoo/documentation 19.0
 * mixins.rst). Its source is not public, so helpdesk.* field names come from
 * Odoo's own demo data (github.com/odoo/industry, 19.0), quoted in each
 * transform, and the shared client drops any the server's fields_get lacks.
 *
 * Models:
 *   - Tickets   helpdesk.ticket
 *   - Messages  mail.message on model 'helpdesk.ticket', message_type email / comment
 *               (addons/mail, public), with mail.message.subtype for visibility
 *   - Contacts  res.partner (a ticket's partner_id)
 *   - Users     res.users with share = false (internal users, i.e. agents)
 *   - Teams     helpdesk.team
 * Tags and macros are refused (501): see metadata.ts.
 *
 * Read only: the vertical has no writes. Odoo documents no webhook signature,
 * so this adapter ships no webhook verifier and inbound deliveries are refused.
 *
 * Every list is one `search_read` page: "offset and limit parameters are
 * available to only retrieve a subset of all matched records" (19.0
 * external_rpc_api, Pagination), in id order, with search_count for the total.
 * `updated_after` narrows every list to `write_date >=` it (withUpdatedAfter).
 */
import {
  ODOO_CREDENTIAL_FORM,
  OdooClient,
  odooDatetime,
  pageOffset,
  reportUpstreamPage,
  type Credentials,
  type OdooDomain,
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

import { DEFAULT_LIMIT } from './constants'
import { metadata } from './metadata'
import { many2oneNum } from './values'
import { TICKET_FIELDS, transformTicket, type RawOdooTicket } from './transform/ticket'
import {
  HUMAN_MESSAGE_TYPES,
  MESSAGE_FIELDS,
  transformMessage,
  type MessageContext,
  type RawOdooMessage,
} from './transform/message'
import { CONTACT_FIELDS, transformContact, type RawOdooPartner } from './transform/contact'
import { USER_FIELDS, transformUser, type RawOdooUser } from './transform/user'
import { TEAM_FIELDS, transformTeam, type RawOdooTeam } from './transform/team'

const TICKET_MODEL = 'helpdesk.ticket'

/** Internal users: `share` is "External user with limited access" (res_users.py). */
const AGENT_DOMAIN: OdooDomain = [['share', '=', false]]

export interface OdooHelpdeskAdapterConfig {
  /** Unused: the Odoo URL is per connection, in `credentials.extra.baseUrl` (the shared Odoo form). */
  instanceUrl?: string
}

function notFound(what: string, id: string): Error {
  return Object.assign(new Error(`Odoo: ${what} ${id} not found`), {
    statusCode: 404,
    code: 'NOT_FOUND',
  })
}

function notSupported(resource: (typeof metadata.unavailableResources)[number]['resource']): Error {
  const reason = metadata.unavailableResources.find((r) => r.resource === resource)!.reason
  return Object.assign(new Error(`odoo-helpdesk cannot read ${resource}s: ${reason}`), {
    statusCode: 501,
    code: 'NOT_SUPPORTED',
  })
}

/** Odoo record ids are integers; anything else names no record. */
function recordId(what: string, id: string): number {
  if (!/^[1-9]\d*$/.test(id)) throw notFound(what, id)
  return Number(id)
}

function pageLimit(params: QueryParams): number {
  const limit = params.limit ?? DEFAULT_LIMIT
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit < 1) {
    throw Object.assign(new Error(`Odoo: limit must be a number ≥ 1 (got ${String(limit)})`), {
      statusCode: 400,
      code: 'VALIDATION',
    })
  }
  return Math.floor(limit)
}

/**
 * `updated_after` as `write_date >=`. Every model with access logging has
 * `write_date`: "Stores when the record was last updated, Datetime", and
 * `_log_access` defaults to `_auto` (19.0 ORM reference, Automatic fields).
 * Inclusive, as the accounting Odoo adapter reads it: Odoo datetimes have
 * second granularity, so a strict `>` would drop a row written in the
 * watermark's own second.
 */
function withUpdatedAfter(domain: OdooDomain, params: QueryParams): OdooDomain {
  const after = params.updatedAfter
  if (!(after instanceof Date) || Number.isNaN(after.getTime())) return domain
  return [...domain, ['write_date', '>=', odooDatetime(after)]]
}

function messageDomain(ticketId: number): OdooDomain {
  return [
    ['model', '=', TICKET_MODEL],
    ['res_id', '=', ticketId],
    ['message_type', 'in', HUMAN_MESSAGE_TYPES],
  ]
}

export class OdooHelpdeskAdapter implements CustomerSupportAdapter {
  credentialFields = ODOO_CREDENTIAL_FORM.credentialFields
  exchangeCredentials = ODOO_CREDENTIAL_FORM.exchangeCredentials

  readonly platform = 'odoo-helpdesk'
  readonly version = '0.1.0'

  constructor(_config: OdooHelpdeskAdapterConfig = {}) {}

  getAuthUrl(_state: string, _scopes?: string[]): string {
    // Odoo authenticates with an API key; there is no OAuth2 redirect.
    return '#api-key-auth'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('OdooHelpdeskAdapter: OAuth2 not supported. Use API key auth.')
  }

  /** An API key is sent as is on every call; there is nothing to refresh. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private client(credentials: Credentials): OdooClient {
    return new OdooClient(credentials)
  }

  private async pageOf<T>(
    credentials: Credentials,
    params: QueryParams,
    model: string,
    domain: OdooDomain,
    fields: string[],
  ): Promise<T[]> {
    const limit = pageLimit(params)
    const offset = pageOffset(params, limit)
    const page = await this.client(credentials).searchPage<T>(model, {
      domain: withUpdatedAfter(domain, params),
      fields,
      offset,
      limit,
    })
    reportUpstreamPage(params, {
      hasMore: page.hasMore,
      ...(page.totalCount !== undefined ? { totalCount: page.totalCount } : {}),
    })
    return page.rows
  }

  /** One record by id with `read` (no default active filter), or a 404. */
  private async one<T>(
    credentials: Credentials,
    what: string,
    model: string,
    id: string,
    fields: string[],
  ): Promise<T> {
    const rows = await this.client(credentials).read<T>(model, [recordId(what, id)], fields)
    const row = rows[0]
    if (!row) throw notFound(what, id)
    return row
  }

  /**
   * The subtype visibility flags and agent authors behind a page of messages:
   * `internal` on mail.message.subtype ("Internal Only", mail_message_subtype.py
   * 14.0–19.0), and the internal res.users whose `partner_id` authored one,
   * archived users included.
   */
  private async messageContext(
    credentials: Credentials,
    rows: RawOdooMessage[],
  ): Promise<MessageContext> {
    const client = this.client(credentials)
    const subtypeIds = [
      ...new Set(rows.map((r) => many2oneNum(r.subtype_id)).filter((n) => n !== undefined)),
    ]
    const partnerIds = [
      ...new Set(rows.map((r) => many2oneNum(r.author_id)).filter((n) => n !== undefined)),
    ]
    const internalSubtypes = new Set<number>()
    if (subtypeIds.length > 0) {
      const subtypes = await client.read<{ id: number; internal?: boolean }>(
        'mail.message.subtype',
        subtypeIds,
        ['id', 'internal'],
      )
      for (const s of subtypes) if (s.internal === true) internalSubtypes.add(s.id)
    }
    const agentByPartner = new Map<number, number>()
    if (partnerIds.length > 0) {
      const users = await client.searchRead<{ id: number; partner_id?: [number, string] | false }>(
        'res.users',
        {
          domain: [
            ['partner_id', 'in', partnerIds],
            ['share', '=', false],
            ['active', 'in', [true, false]],
          ],
          fields: ['id', 'partner_id'],
          order: 'id asc',
        },
      )
      for (const u of users) {
        const p = many2oneNum(u.partner_id)
        if (p !== undefined && !agentByPartner.has(p)) agentByPartner.set(p, u.id)
      }
    }
    return { internalSubtypes, agentByPartner }
  }

  // ── Tickets (helpdesk.ticket) ─────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const rows = await this.pageOf<RawOdooTicket>(
      credentials,
      params,
      TICKET_MODEL,
      [],
      TICKET_FIELDS,
    )
    return rows.map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    return transformTicket(
      await this.one<RawOdooTicket>(credentials, 'ticket', TICKET_MODEL, id, TICKET_FIELDS),
    )
  }

  // ── Messages (mail.message on helpdesk.ticket) ────────────────────────────

  async listMessages(
    credentials: Credentials,
    ticketId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    const tid = recordId('ticket', ticketId)
    const rows = await this.pageOf<RawOdooMessage>(
      credentials,
      params,
      'mail.message',
      messageDomain(tid),
      MESSAGE_FIELDS,
    )
    // An empty page may mean no such ticket: that is a 404, not an empty thread.
    if (rows.length === 0) {
      await this.one<RawOdooTicket>(credentials, 'ticket', TICKET_MODEL, ticketId, ['id'])
    }
    const ctx = await this.messageContext(credentials, rows)
    return rows.map((r) => transformMessage(r, ctx))
  }

  async getMessage(credentials: Credentials, id: string): Promise<Message> {
    const row = await this.one<RawOdooMessage>(
      credentials,
      'message',
      'mail.message',
      id,
      MESSAGE_FIELDS,
    )
    // Only a person's message in a ticket's chatter is a ticket message.
    if (
      row.model !== TICKET_MODEL ||
      typeof row.message_type !== 'string' ||
      !HUMAN_MESSAGE_TYPES.includes(row.message_type)
    ) {
      throw notFound('message', id)
    }
    return transformMessage(row, await this.messageContext(credentials, [row]))
  }

  // ── Contacts (res.partner) ────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const rows = await this.pageOf<RawOdooPartner>(
      credentials,
      params,
      'res.partner',
      [],
      CONTACT_FIELDS,
    )
    return rows.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    return transformContact(
      await this.one<RawOdooPartner>(credentials, 'contact', 'res.partner', id, CONTACT_FIELDS),
    )
  }

  // ── Users (res.users, internal) ───────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const rows = await this.pageOf<RawOdooUser>(
      credentials,
      params,
      'res.users',
      AGENT_DOMAIN,
      USER_FIELDS,
    )
    return rows.map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const row = await this.one<RawOdooUser>(credentials, 'user', 'res.users', id, USER_FIELDS)
    // A portal (share) user is a customer, not an agent.
    if (row.share === true) throw notFound('user', id)
    return transformUser(row)
  }

  // ── Teams (helpdesk.team) ─────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const rows = await this.pageOf<RawOdooTeam>(
      credentials,
      params,
      'helpdesk.team',
      [],
      TEAM_FIELDS,
    )
    return rows.map(transformTeam)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    return transformTeam(
      await this.one<RawOdooTeam>(credentials, 'team', 'helpdesk.team', id, TEAM_FIELDS),
    )
  }

  // ── Refused ───────────────────────────────────────────────────────────────

  async listTags(_credentials: Credentials, _params: QueryParams): Promise<Tag[]> {
    throw notSupported('tag')
  }

  async getTag(_credentials: Credentials, _id: string): Promise<Tag> {
    throw notSupported('tag')
  }

  async listMacros(_credentials: Credentials, _params: QueryParams): Promise<Macro[]> {
    throw notSupported('macro')
  }

  async getMacro(_credentials: Credentials, _id: string): Promise<Macro> {
    throw notSupported('macro')
  }
}
