/**
 * Totango adapter for the CRM vertical.
 *
 * Maps the Totango REST API to canonical CRM resources.
 * Docs:
 *   https://support.totango.com/hc/en-us/articles/204174135-Search-API-accounts-and-users
 *   https://support.totango.com/hc/en-us/articles/360048132792-Search-API-events
 *   https://support.totango.com/hc/en-us/articles/115000597266-Touchpoints-API
 *   https://support.totango.com/hc/en-us/articles/360043441152-Customer-Data-Hub-API
 * (The HTML pages sit behind a bot challenge; the same articles are served as
 * JSON at https://support.totango.com/api/v2/help_center/en-us/articles/<id>.json.)
 *
 * ── Auth ─────────────────────────────────────────────────────────────────────
 *   Single app-token passed as the `app-token` request header on every call.
 *   credentials.accessToken = app-token value
 *
 * ── Coverage ─────────────────────────────────────────────────────────────────
 *   Contacts (users):     list (POST /api/v1/search/users)
 *   Companies (accounts): list (POST /api/v1/search/accounts)
 *   Activities (events):  list (POST /api/v2/events/search), create
 *   Notes (touchpoints):  list (POST /api/v2/events/search, event_type note), create
 *   getContact / getCompany refuse: the Search API documents no lookup by id.
 *
 * ── Pagination ────────────────────────────────────────────────────────────────
 *   Accounts and users: `count` ("The max value for count is 1000") and `offset`
 *   ("Record number (0 states "start at record 0")"), at most 10,000 records.
 *   Events: `count` (max 1000) and `offset` ("Page number (0 is the 1st-page)").
 */

import { pageOffset, reportUpstreamPage, simpleApiKey } from '@opensteward/shared'
import type { UpstreamPageMeta } from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'
import type { WebhookEvent } from '../../schema/webhook'

import { TotangoClient, type RawTotangoEvent, type TotangoSearchQuery } from './client'
import { MAX_PAGE_SIZE, SEARCH_RECORD_CAP } from './constants'
import {
  verifyWebhook as _verifyWebhook,
  parseWebhookEvents as _parseWebhookEvents,
} from './webhook'
import { transformContact } from './transform/contact'
import { transformCompany } from './transform/company'
import { transformActivity, untransformActivity } from './transform/activity'
import { transformNote, untransformNote } from './transform/note'

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'App token',
  helpText: 'Find your app token in Totango under Settings → Integrations → API Token.',
  placeholder: 'xxxxxxxx_user@yourdomain.com',
})

/**
 * Search API (events): "Optional values for event_type are "note"
 * (touchpoint), "campaign_touch: (campaigns event), "alert" (health change),
 * "task" (task event - created, updated, completed)".
 */
const EVENT_TYPES = ['note', 'campaign_touch', 'alert', 'task'] as const

function eventTypeTerm(eventType: string): Record<string, unknown> {
  return { type: 'event_property', name: 'event_type', eq: eventType }
}

/** "Get notes (touchpoints)": {"type":"event_property","name":"event_type","eq":"note"}. */
const NOTE_TERMS = [eventTypeTerm('note')]

/** "Get notes (touchpoints) and campaigns events": {"type":"or","or":[...]}, over every documented type. */
const ALL_EVENT_TERMS = [{ type: 'or', or: EVENT_TYPES.map(eventTypeTerm) }]

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

function searchCapError(): Error {
  return Object.assign(
    new Error(
      `Totango's Search API gives access to at most ${SEARCH_RECORD_CAP} records ("There is a ` +
        'maximum of 10,000 total records that can be accessed through this API."). This page ' +
        'reaches past that, so the rest of the collection cannot be listed through it.',
    ),
    { statusCode: 422, code: 'UPSTREAM_LIMIT' },
  )
}

function badEnvelope(path: string, expected: string): Error {
  return Object.assign(
    new Error(`Totango ${path} answered without the documented ${expected} array`),
    { statusCode: 502, code: 'UPSTREAM_ERROR' },
  )
}

/** A reported total, when the platform sent a usable one. */
function total(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined
}

export class TotangoAdapter implements CrmAdapter {
  // Connect Link support — single app-token form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'totango'
  readonly version = '0.1.0'

  /** Every list endpoint documents a `count` of at most 1000. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Totango uses API token auth, not OAuth2.
    return ''
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // Caller passes the app-token as `code`.
    return { accessToken: code }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // App tokens do not expire; nothing to refresh.
    return credentials
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return _verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return _parseWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): TotangoClient {
    return new TotangoClient(credentials)
  }

  /**
   * The caller's limit clamped to the documented max of 1000. A missing or
   * unusable limit is the documented search default, "count (optional,
   * default: 1000)".
   */
  private pageSize(params: QueryParams): number {
    const l = Number(params.limit)
    return Number.isFinite(l) && l >= 1 ? Math.min(Math.floor(l), MAX_PAGE_SIZE) : MAX_PAGE_SIZE
  }

  private report(params: QueryParams, count: number, meta: UpstreamPageMeta): void {
    const out: UpstreamPageMeta = { ...meta }
    if (typeof params.limit === 'number' && count < params.limit) out.pageSize = count
    reportUpstreamPage(params, out)
  }

  /**
   * One page of an account or user search. `offset` is a record number and
   * the order is the documented default, display_name ascending, sent
   * explicitly. `terms` and `fields` are mandatory: no filter, and no extra
   * fields ("the account name and account-id are always returned as well").
   *
   * Unverified live: the doc describes `terms` as "An array contains one or
   * more filter conditions" and documents no match-all term, so an unfiltered
   * list sends `terms: []` (as this adapter always has). If Totango rejects an
   * empty array, these lists fail loudly with the upstream error.
   */
  private async searchPage<H>(
    params: QueryParams,
    path: string,
    run: (query: TotangoSearchQuery) => Promise<{ hits: H[] | undefined; total: unknown }>,
  ): Promise<H[]> {
    const count = this.pageSize(params)
    const offset = pageOffset(params, count)
    if (offset >= SEARCH_RECORD_CAP) throw searchCapError()
    const res = await run({
      terms: [],
      fields: [],
      count,
      offset,
      sort_by: 'display_name',
      sort_order: 'ASC',
    })
    if (!Array.isArray(res.hits)) throw badEnvelope(path, 'hits')
    const hits = res.hits
    const totalHits = total(res.total)
    const end = offset + hits.length
    // Cut short at the ceiling: whether more records exist is unknowable.
    if (
      hits.length < count &&
      end >= SEARCH_RECORD_CAP &&
      (totalHits === undefined || totalHits > end)
    ) {
      throw searchCapError()
    }
    // "If you receive 1000 records, assume there’s more ... Repeat paging until
    // the number of records returned is less than 1000." — used when no total.
    const hasMore = totalHits !== undefined ? end < totalHits : hits.length >= count
    this.report(
      params,
      count,
      totalHits !== undefined ? { totalCount: totalHits, hasMore } : { hasMore },
    )
    return hits
  }

  /**
   * One page of POST /api/v2/events/search. "offset (mandatory): Page number
   * (0 is the 1st-page)", so the 0-based page index is sent, not a record
   * number. "fields ... should be always empty (i.e., [])."
   */
  private async eventPage(
    credentials: Credentials,
    params: QueryParams,
    terms: Record<string, unknown>[],
  ): Promise<RawTotangoEvent[]> {
    const count = this.pageSize(params)
    const pageIndex = pageOffset(params, 1)
    const res = await this.client(credentials).searchEvents({
      terms,
      fields: [],
      offset: pageIndex,
      count,
    })
    const hits = res?.response?.events?.hits
    if (!Array.isArray(hits)) throw badEnvelope('/api/v2/events/search', 'response.events.hits')
    const totalEvents = total(res.response?.events?.total)
    const end = pageIndex * count + hits.length
    const hasMore = totalEvents !== undefined ? end < totalEvents : hits.length >= count
    this.report(
      params,
      count,
      totalEvents !== undefined ? { totalCount: totalEvents, hasMore } : { hasMore },
    )
    return hits
  }

  // ── Contacts (Totango users) ───────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const hits = await this.searchPage(params, '/api/v1/search/users', async (query) => {
      const res = await this.client(credentials).searchUsers(query)
      // The users sample is malformed JSON: `users` sits inside `response` (as
      // in the accounts sample) or beside it. Both readings are the doc's.
      return {
        hits: res?.response?.users?.hits ?? res?.users?.hits,
        total: res?.response?.total_hits,
      }
    })
    return hits.map(transformContact)
  }

  async getContact(_credentials: Credentials, _id: string): Promise<Contact> {
    throw notSupported(
      'Totango cannot get a user by id: the Search API (accounts and users) documents only ' +
        'attribute filters such as {"type":"string","term":"status_group","in_list":["paying"]} ' +
        'and no lookup by user id',
    )
  }

  // ── Companies (Totango accounts) ──────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const hits = await this.searchPage(params, '/api/v1/search/accounts', async (query) => {
      const res = await this.client(credentials).searchAccounts(query)
      return { hits: res?.response?.accounts?.hits, total: res?.response?.stats?.total_hits }
    })
    return hits.map(transformCompany)
  }

  async getCompany(_credentials: Credentials, _id: string): Promise<Company> {
    throw notSupported(
      'Totango cannot get an account by id: the Search API (accounts and users) documents only ' +
        'attribute filters such as {"type":"string","term":"status_group","in_list":["paying"]} ' +
        'and no lookup by account-id',
    )
  }

  // ── Activities (Totango events) ────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const events = await this.eventPage(credentials, params, ALL_EVENT_TERMS)
    return events.map(transformActivity)
  }

  // ── Notes (Totango touchpoints) ───────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const events = await this.eventPage(credentials, params, NOTE_TERMS)
    return events.map(transformNote)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    // `content` is required for touchpoint creation.
    if (!body.content) {
      throw Object.assign(new Error('Totango: note content is required'), { statusCode: 400 })
    }
    const raw = await this.client(credentials).createTouchpoint<RawTotangoEvent>(
      body as Record<string, unknown>,
    )
    return transformNote(raw)
  }

  // ── Activities — create ────────────────────────────────────────────────────

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    if (!body.account_id) {
      throw Object.assign(new Error('Totango: activity company_id (account_id) is required'), {
        statusCode: 400,
      })
    }
    const raw = await this.client(credentials).createTouchpoint<RawTotangoEvent>(
      body as Record<string, unknown>,
    )
    return transformActivity(raw)
  }
}
