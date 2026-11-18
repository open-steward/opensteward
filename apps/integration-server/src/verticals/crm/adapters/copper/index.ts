import { simpleApiKey } from '@opensteward/shared'
/**
 * Copper adapter for the CRM vertical.
 *
 * Maps the Copper CRM Developer API v1 to canonical CRM resources.
 * Docs: https://developer.copper.com/
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (35):
 *   Contacts:   list, get, create, update, delete  (People endpoint)
 *   Companies:  list, get, create, update, delete
 *   Deals:      list, get, create, update, delete  (Opportunities endpoint)
 *   Pipelines:  list, get
 *   Activities: list, get                          (read-only — Copper v1 has no create/update/delete for activities)
 *   Notes:      list, get, create, delete          (note-type activities, through /activities)
 *   Auth:       getAuthUrl (N/A — API key), exchangeCode (N/A), refreshCredentials (N/A)
 *   Webhooks:   verifyWebhook (HMAC-SHA256 via X-PW-Signature), parseWebhookEvents
 *
 * Omitted (7) — registry returns HTTP 501 automatically:
 *   Activities: createActivity, updateActivity, deleteActivity
 *   Notes:      updateNote
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { CopperClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyWebhook as _verifyWebhook, parseWebhookEvents as _parseWebhookEvents } from './webhook'
import {
  transformContact, untransformContact, type RawCopperContact,
} from './transform/contact'
import {
  transformCompany, untransformCompany, type RawCopperCompany,
} from './transform/company'
import {
  transformDeal, untransformDeal, type RawCopperDeal,
} from './transform/deal'
import {
  transformPipeline, type RawCopperPipeline,
} from './transform/pipeline'
import {
  transformActivity, type RawCopperActivity,
} from './transform/activity'
import {
  NOTE_ACTIVITY_TYPE, isNoteActivity, transformNoteActivity, untransformNoteActivity,
} from './transform/note'

export interface CopperAdapterConfig {
  /** Static API key. Stored as credentials.accessToken. */
  apiKey?: string
  /** User email required by Copper API alongside the API key. */
  userEmail?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()

/**
 * Copper /search endpoints: "The default value for page_size is 20, and its
 * value can be set to any integer between 1 and 200."
 */
const MAX_PAGE_SIZE = 200

/**
 * Oldest-created first. Copper: "It is highly recommended that you sort the
 * results you get back from a /search endpoint. This ensures that records are
 * returned in a consistent fashion across requests." Its defaults — people by
 * `first_name`, companies by `date_modified`, opportunities by `name` — let a
 * record created or edited mid-walk shift rows across a page boundary;
 * `date_created` never changes and new records land at the end. Activities
 * search documents no `sort_by`, so it is sent none.
 */
const OLDEST_FIRST = { sort_by: 'date_created', sort_direction: 'asc' }


export class CopperAdapter implements CrmAdapter {

  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'copper'
  readonly version = '0.1.0'

  private staticApiKey: string | undefined
  private staticUserEmail: string | undefined

  constructor(config: CopperAdapterConfig = {}) {
    this.staticApiKey = config.apiKey
    this.staticUserEmail = config.userEmail
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Copper uses API key auth — no OAuth URL
    return '#copper-api-key'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return {
      accessToken: this.staticApiKey ?? '',
      extra: { email: this.staticUserEmail ?? '' },
    }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys do not expire
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

  private client(credentials: Credentials): CopperClient {
    const effective: Credentials = this.staticApiKey
      ? {
          accessToken: this.staticApiKey,
          extra: { email: this.staticUserEmail ?? credentials.extra?.['email'] ?? '' },
        }
      : credentials
    return new CopperClient(effective)
  }

  /**
   * `page_number` ("starting with 1") + `page_size` (a whole number in 1..200)
   * for a /search body. A page missing, below 1 or not a number is page 1; a
   * limit that is not a number of at least 1 is the adapter default.
   */
  private searchPage(params: QueryParams): [pageNumber: number, pageSize: number] {
    const p = Number(params.page)
    const l = Number(params.limit)
    return [
      Number.isFinite(p) && p >= 1 ? Math.floor(p) : 1,
      Number.isFinite(l) && l >= 1 ? Math.min(Math.floor(l), MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE,
    ]
  }

  // ── Contacts (People) ─────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const { items } = await this.client(credentials).search<RawCopperContact>(
      '/people',
      ...this.searchPage(params),
      OLDEST_FIRST,
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawCopperContact>(`/people/${id}`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).post<RawCopperContact>(
      '/people',
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).put<RawCopperContact>(
      `/people/${id}`,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/people/${id}`)
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const { items } = await this.client(credentials).search<RawCopperCompany>(
      '/companies',
      ...this.searchPage(params),
      OLDEST_FIRST,
    )
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawCopperCompany>(`/companies/${id}`)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).post<RawCopperCompany>(
      '/companies',
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async updateCompany(credentials: Credentials, id: string, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).put<RawCopperCompany>(
      `/companies/${id}`,
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/companies/${id}`)
  }

  // ── Deals (Opportunities) ─────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const { items } = await this.client(credentials).search<RawCopperDeal>(
      '/opportunities',
      ...this.searchPage(params),
      OLDEST_FIRST,
    )
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawCopperDeal>(`/opportunities/${id}`)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).post<RawCopperDeal>(
      '/opportunities',
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).put<RawCopperDeal>(
      `/opportunities/${id}`,
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/opportunities/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  async listPipelines(credentials: Credentials, _params: QueryParams): Promise<Pipeline[]> {
    const items = await this.client(credentials).list<RawCopperPipeline>('/pipelines')
    return items.map(transformPipeline)
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const raw = await this.client(credentials).get<RawCopperPipeline>(`/pipelines/${id}`)
    return transformPipeline(raw)
  }

  // ── Activities ────────────────────────────────────────────────────────────
  // Copper v1 does not expose create/update/delete for activities — read-only.

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const { items } = await this.client(credentials).search<RawCopperActivity>(
      '/activities',
      ...this.searchPage(params),
    )
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).get<RawCopperActivity>(`/activities/${id}`)
    return transformActivity(raw)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────
  // A note is an activity of NOTE_ACTIVITY_TYPE: every call goes through the
  // documented /activities endpoints, so a listed note's id is the id the
  // single-note calls take. updateNote is omitted.

  /**
   * Copper documents no notes resource: a note is an activity of the
   * user-entered type "Notes", which has "a hard-coded ID of 0"
   * (activities/list-activity-types.html). So notes are listed through
   * POST /activities/search filtered by `activity_types`, paged like
   * listActivities.
   */
  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const { items } = await this.client(credentials).search<RawCopperActivity>(
      '/activities',
      ...this.searchPage(params),
      { activity_types: [NOTE_ACTIVITY_TYPE] },
    )
    return items.map(transformNoteActivity)
  }

  /**
   * GET /activities/{id} ("Fetch an Activity By ID"). An activity of another
   * type is not a note, and is not found here: a phone call must not read, or
   * be deleted, as a note.
   */
  private async noteActivity(credentials: Credentials, id: string): Promise<RawCopperActivity> {
    const raw = await this.client(credentials).get<RawCopperActivity>(`/activities/${id}`)
    if (!isNoteActivity(raw)) {
      throw Object.assign(new Error(`Copper activity ${id} is not a note`), {
        statusCode: 404,
        code: 'NOT_FOUND',
      })
    }
    return raw
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    return transformNoteActivity(await this.noteActivity(credentials, id))
  }

  /** POST /activities with the note type ("Create a New Activity", its "Create New Note" example). */
  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).post<RawCopperActivity>(
      '/activities',
      untransformNoteActivity(data),
    )
    return transformNoteActivity(raw)
  }

  /** DELETE /activities/{id} ("Delete an Activity"), once the activity is known to be a note. */
  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.noteActivity(credentials, id)
    await this.client(credentials).delete(`/activities/${id}`)
  }
}
