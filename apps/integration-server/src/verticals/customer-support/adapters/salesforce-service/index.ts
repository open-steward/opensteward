/**
 * Salesforce Service Cloud adapter for the customer-support vertical.
 *
 * Auth: OAuth 2.0 web server flow on login.salesforce.com, or
 * test.salesforce.com for a sandbox (chosen on the Connect page through
 * `oauthFields`). Every API call goes to the `instance_url` the token
 * response returns, kept in `credentials.extra.instanceUrl`. See auth.ts.
 *
 * Data: the REST API Query resource (SOQL), API v60.0 as crm/salesforce.
 *   - Tickets:  Case
 *   - Messages: CaseComment, then EmailMessage, of one Case
 *   - Contacts: Contact
 *   - Users:    User WHERE UserType = 'Standard' (internal licences)
 *   - Teams:    Group WHERE Type = 'Queue'
 *   - Tags, Macros: refused with 501 NOT_SUPPORTED before any request.
 *
 * Paging: SOQL batches are 200-2,000 rows, whatever the caller asked for, and
 * OFFSET stops at 2,000 rows, so every list walks the `nextRecordsUrl` chain
 * and the shared row pager (`pageByRows`) cuts exactly the caller's page out
 * of it, reporting `hasMore` exactly — the pattern crm/salesforce uses.
 *
 * updated_after: every list adds `LastModifiedDate >= <dateTime>` to its SOQL
 * WHERE clause, a server-side filter ("WHERE CreatedDate >
 * 2005-10-08T01:02:03Z"; dateTime format `YYYY-MM-DDThh:mm:ssZ`).
 * https://developer.salesforce.com/docs/atlas.en-us.soql_sosl.meta/soql_sosl/sforce_api_calls_soql_select_dateformats.htm
 *
 * Record reads by id use the same SOQL with `WHERE Id = '<id>'`, so a get and
 * a list return the same fields (Owner.Type included). An id that is not a
 * Salesforce id ("15-character, base-62" or the 18-character case-safe form,
 * https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/field_types.htm)
 * is answered 404 before any request, so no caller text reaches a query.
 */
// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: macro — see MACROS_REFUSED below.
// Unavailable: tag   — see TAGS_REFUSED below.
import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
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
  buildAuthUrl,
  exchangeCode as sfExchangeCode,
  oauthFields as sfOauthFields,
  refreshCredentials as sfRefreshCredentials,
  resolveEnvironment,
} from './auth'
import { SalesforceServiceClient } from './client'
import {
  DEFAULT_LIST_LIMIT,
  DEFAULT_SCOPES,
  MAX_QUERY_BATCH_SIZE,
  MIN_QUERY_BATCH_SIZE,
} from './constants'
import { verifySalesforceServiceWebhook, parseSalesforceServiceWebhookEvents } from './webhook'

import { CASE_FIELDS, transformTicket, type RawSalesforceCase } from './transform/ticket'
import {
  CASE_COMMENT_FIELDS,
  EMAIL_MESSAGE_FIELDS,
  transformCaseComment,
  transformEmailMessage,
  type RawSalesforceCaseComment,
  type RawSalesforceEmailMessage,
} from './transform/message'
import { CONTACT_FIELDS, transformContact, type RawSalesforceContact } from './transform/contact'
import { USER_FIELDS, transformUser, type RawSalesforceUser } from './transform/user'
import { QUEUE_FIELDS, transformTeam, type RawSalesforceGroup } from './transform/team'

export interface SalesforceServiceAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

function notSupported(reason: string): Error {
  return Object.assign(new Error(reason), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

function notFound(what: string, id: string): Error {
  return Object.assign(new Error(`Salesforce ${what} ${id} not found`), { statusCode: 404 })
}

const TAGS_REFUSED =
  'Salesforce Service Cloud cannot list tags: the Case object reference documents no tag ' +
  'field, and no canonical tag maps onto a Case field'

const MACROS_REFUSED =
  'Salesforce Service Cloud cannot list macros: a Macro "is a set of instructions that tells ' +
  'the system to perform one or more tasks" (SELECT, SET, INSERT, SUBMIT steps), not a canned ' +
  'response, and the Macro object documents no body text'

/** UserType "Standard: user license" — internal users, not portal or partner users. */
const AGENT = [`UserType = 'Standard'`]

/** Group.Type "Queue—Public group that includes all the User records that are members of a queue". */
const QUEUE = [`Type = 'Queue'`]

/** "15-character, base-62" ids, or the 18-character case-safe form. */
const SALESFORCE_ID = /^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/

/**
 * SOQL dateTime literal `YYYY-MM-DDThh:mm:ssZ`. Seconds are the literal's
 * finest unit, so the watermark is truncated to its second and compared with
 * `>=`: a row written in the watermark's own second is still returned.
 */
function soqlDateTime(d: Date): string {
  return `${d.toISOString().slice(0, 19)}Z`
}

/**
 * Salesforce refused a query locator (`nextRecordsUrl`): the chain behind it is
 * gone, and the row pager walks again from a fresh query. Same test as
 * crm/salesforce.
 */
function isExpiredLocator(err: unknown): boolean {
  return err instanceof Error && err.message.includes('INVALID_QUERY_LOCATOR')
}

interface SoqlBatch<T> {
  records: T[]
  next?: string
}

/** Where the CaseComment-then-EmailMessage stream of one case continues. */
type MessageCursor = { obj: 'CaseComment' | 'EmailMessage'; next?: string }

type MessageRow =
  | { obj: 'CaseComment'; raw: RawSalesforceCaseComment }
  | { obj: 'EmailMessage'; raw: RawSalesforceEmailMessage }

export class SalesforceServiceAdapter implements CustomerSupportAdapter {
  readonly platform = 'salesforce-service'
  readonly version = '0.2.0'

  private readonly clientId: string
  private readonly clientSecret: string
  private readonly redirectUri: string
  private readonly scopes: string[]

  constructor(config: Partial<SalesforceServiceAdapterConfig> = {}) {
    this.clientId = config.clientId ?? ''
    this.clientSecret = config.clientSecret ?? ''
    this.redirectUri = config.redirectUri ?? ''
    this.scopes = config.scopes && config.scopes.length > 0 ? config.scopes : DEFAULT_SCOPES
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  /** Production or sandbox, asked for before the redirect: the two log in on different hosts. */
  oauthFields(): CredentialField[] {
    return sfOauthFields()
  }

  getAuthUrl(
    state: string,
    overrideScopes?: string[],
    _codeChallenge?: string,
    inputs?: Record<string, string>,
  ): string {
    return buildAuthUrl(
      this.clientId,
      this.redirectUri,
      overrideScopes ?? this.scopes,
      state,
      resolveEnvironment(inputs?.['environment']),
    )
  }

  /** Reached only when no inputs were collected: a production org. */
  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return sfExchangeCode(code, redirectUri, this.clientId, this.clientSecret, 'production')
  }

  async exchangeCodeWithInputs(
    code: string,
    redirectUri: string,
    inputs: Record<string, string>,
  ): Promise<Credentials> {
    return sfExchangeCode(
      code,
      redirectUri,
      this.clientId,
      this.clientSecret,
      resolveEnvironment(inputs['environment']),
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return sfRefreshCredentials(credentials, this.clientId, this.clientSecret)
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────
  // webhook.ts is unchanged from before this rebuild: it checks a signature
  // scheme no Salesforce document describes. See README.md.

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifySalesforceServiceWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseSalesforceServiceWebhookEvents(payload)
  }

  // ── SOQL helpers ───────────────────────────────────────────────────────────

  private client(credentials: Credentials): SalesforceServiceClient {
    return new SalesforceServiceClient(credentials)
  }

  /**
   * Pager scope for ONE connection: the org plus a fingerprint of this
   * connection's refresh token (`connectionScope`). Record visibility is per
   * user (sharing rules), and the row pager keeps the rows it fetched.
   */
  private scopeFor(credentials: Credentials): string {
    const url = credentials.extra?.['instanceUrl']
    return connectionScope(
      `salesforce-service:${typeof url === 'string' && url ? url : 'unknown'}`,
      credentials,
    )
  }

  /** Salesforce refuses a batchSize outside 200-2,000; the row pager cuts the caller's page out. */
  private batchSize(params: QueryParams): number {
    const limit = typeof params.limit === 'number' ? params.limit : DEFAULT_LIST_LIMIT
    return Math.min(MAX_QUERY_BATCH_SIZE, Math.max(MIN_QUERY_BATCH_SIZE, limit))
  }

  /** `SELECT <fields> FROM <sobject> [WHERE ...]`, with `LastModifiedDate >=` for updated_after. */
  private soql(
    fields: readonly string[],
    sobject: string,
    conditions: string[],
    params: QueryParams,
  ): string {
    const where = [...conditions]
    const after = params.updatedAfter
    if (after instanceof Date && !Number.isNaN(after.getTime())) {
      where.push(`LastModifiedDate >= ${soqlDateTime(after)}`)
    }
    const base = `SELECT ${fields.join(',')} FROM ${sobject}`
    return where.length > 0 ? `${base} WHERE ${where.join(' AND ')}` : base
  }

  /**
   * One batch of `soql`: the first when `nextRecordsUrl` is absent, else the
   * batch it names. `ORDER BY Id` gives a stable walk; there is no LIMIT,
   * which would cap the whole result, not one batch.
   */
  private async soqlBatch<T>(
    client: SalesforceServiceClient,
    soql: string,
    batchSize: number,
    nextRecordsUrl: string | undefined,
  ): Promise<SoqlBatch<T>> {
    const res = nextRecordsUrl
      ? await client.queryNext<T>(nextRecordsUrl)
      : await client.query<T>(`${soql} ORDER BY Id`, batchSize)
    const next = !res.done && res.nextRecordsUrl ? res.nextRecordsUrl : undefined
    return { records: res.records ?? [], next }
  }

  /** The caller's page of one SOQL list, cut from Salesforce's batches. */
  private async listSoqlRows<T>(
    credentials: Credentials,
    soql: string,
    params: QueryParams,
  ): Promise<T[]> {
    const client = this.client(credentials)
    const batchSize = this.batchSize(params)
    const key = cursorPagerKey(this.scopeFor(credentials), soql, { batchSize })
    const { items } = await pageByRows<T, string>(
      key,
      params,
      async (cursor) => {
        const batch = await this.soqlBatch<T>(client, soql, batchSize, cursor)
        return { items: batch.records, next: batch.next }
      },
      { defaultLimit: DEFAULT_LIST_LIMIT, restartOn: isExpiredLocator },
    )
    return items
  }

  /** One record by id through the list's own SOQL, or 404. */
  private async getOne<T>(
    credentials: Credentials,
    what: string,
    fields: readonly string[],
    sobject: string,
    conditions: string[],
    id: string,
  ): Promise<T> {
    if (!SALESFORCE_ID.test(id)) throw notFound(what, id)
    const soql = this.soql(fields, sobject, [`Id = '${id}'`, ...conditions], {})
    const res = await this.client(credentials).query<T>(soql)
    const row = res.records?.[0]
    if (!row) throw notFound(what, id)
    return row
  }

  // ── Tickets (Case) ─────────────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const rows = await this.listSoqlRows<RawSalesforceCase>(
      credentials,
      this.soql(CASE_FIELDS, 'Case', [], params),
      params,
    )
    return rows.map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    return transformTicket(
      await this.getOne<RawSalesforceCase>(credentials, 'case', CASE_FIELDS, 'Case', [], id),
    )
  }

  // ── Messages (CaseComment + EmailMessage) ──────────────────────────────────

  /**
   * One stream per case: every CaseComment batch, then every EmailMessage
   * batch (SOQL has no UNION), both filtered on `ParentId` — "Required. ID of
   * the parent Case of the CaseComment" / "ID of the case that's associated
   * with the email". `pageByRows` cuts the caller's pages out of the stream,
   * as crm/salesforce does for Tasks then Events.
   */
  async listMessages(
    credentials: Credentials,
    ticketId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    if (!SALESFORCE_ID.test(ticketId)) throw notFound('case', ticketId)
    const parent = [`ParentId = '${ticketId}'`]
    const commentSoql = this.soql(CASE_COMMENT_FIELDS, 'CaseComment', parent, params)
    const emailSoql = this.soql(EMAIL_MESSAGE_FIELDS, 'EmailMessage', parent, params)
    const client = this.client(credentials)
    const batchSize = this.batchSize(params)
    const key = cursorPagerKey(this.scopeFor(credentials), `${commentSoql} + ${emailSoql}`, {
      batchSize,
    })
    const { items } = await pageByRows<MessageRow, MessageCursor>(
      key,
      params,
      async (at) => {
        if ((at?.obj ?? 'CaseComment') === 'CaseComment') {
          const batch = await this.soqlBatch<RawSalesforceCaseComment>(
            client,
            commentSoql,
            batchSize,
            at?.next,
          )
          return {
            items: batch.records.map((raw) => ({ obj: 'CaseComment' as const, raw })),
            next: batch.next ? { obj: 'CaseComment', next: batch.next } : { obj: 'EmailMessage' },
          }
        }
        const batch = await this.soqlBatch<RawSalesforceEmailMessage>(
          client,
          emailSoql,
          batchSize,
          at?.next,
        )
        return {
          items: batch.records.map((raw) => ({ obj: 'EmailMessage' as const, raw })),
          next: batch.next ? { obj: 'EmailMessage', next: batch.next } : undefined,
        }
      },
      { defaultLimit: DEFAULT_LIST_LIMIT, restartOn: isExpiredLocator },
    )
    return items.map((row) =>
      row.obj === 'CaseComment' ? transformCaseComment(row.raw) : transformEmailMessage(row.raw),
    )
  }

  /** A message id is a CaseComment's or an EmailMessage's; the comment is looked up first. */
  async getMessage(credentials: Credentials, id: string): Promise<Message> {
    if (!SALESFORCE_ID.test(id)) throw notFound('message', id)
    const client = this.client(credentials)
    const comments = await client.query<RawSalesforceCaseComment>(
      this.soql(CASE_COMMENT_FIELDS, 'CaseComment', [`Id = '${id}'`], {}),
    )
    const comment = comments.records?.[0]
    if (comment) return transformCaseComment(comment)
    const emails = await client.query<RawSalesforceEmailMessage>(
      this.soql(EMAIL_MESSAGE_FIELDS, 'EmailMessage', [`Id = '${id}'`], {}),
    )
    const email = emails.records?.[0]
    if (email) return transformEmailMessage(email)
    throw notFound('message', id)
  }

  // ── Contacts (Contact) ─────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const rows = await this.listSoqlRows<RawSalesforceContact>(
      credentials,
      this.soql(CONTACT_FIELDS, 'Contact', [], params),
      params,
    )
    return rows.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    return transformContact(
      await this.getOne<RawSalesforceContact>(
        credentials,
        'contact',
        CONTACT_FIELDS,
        'Contact',
        [],
        id,
      ),
    )
  }

  // ── Users (User, Standard licence) ─────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const rows = await this.listSoqlRows<RawSalesforceUser>(
      credentials,
      this.soql(USER_FIELDS, 'User', AGENT, params),
      params,
    )
    return rows.map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    return transformUser(
      await this.getOne<RawSalesforceUser>(credentials, 'user', USER_FIELDS, 'User', AGENT, id),
    )
  }

  // ── Tags ───────────────────────────────────────────────────────────────────

  async listTags(_credentials: Credentials, _params: QueryParams): Promise<Tag[]> {
    throw notSupported(TAGS_REFUSED)
  }

  async getTag(_credentials: Credentials, _id: string): Promise<Tag> {
    throw notSupported(TAGS_REFUSED)
  }

  // ── Teams (queues) ─────────────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const rows = await this.listSoqlRows<RawSalesforceGroup>(
      credentials,
      this.soql(QUEUE_FIELDS, 'Group', QUEUE, params),
      params,
    )
    return rows.map(transformTeam)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    return transformTeam(
      await this.getOne<RawSalesforceGroup>(credentials, 'queue', QUEUE_FIELDS, 'Group', QUEUE, id),
    )
  }

  // ── Macros ─────────────────────────────────────────────────────────────────

  async listMacros(_credentials: Credentials, _params: QueryParams): Promise<Macro[]> {
    throw notSupported(MACROS_REFUSED)
  }

  async getMacro(_credentials: Credentials, _id: string): Promise<Macro> {
    throw notSupported(MACROS_REFUSED)
  }
}
