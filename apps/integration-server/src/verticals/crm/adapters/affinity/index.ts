import {
  simpleApiKey,
  pageByCursor,
  cursorPagerKey,
  connectionScope,
  reportUpstreamPage,
  pageByRows,
} from '@opensteward/shared'
/**
 * Affinity adapter for the CRM vertical.
 *
 * Maps the Affinity v2 REST API to canonical CRM resources.
 * Docs: https://developer.affinity.co/ (v2 reference; spec at
 *   https://developer.affinity.co/api-reference/openapi.json)
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (22):
 *   Contacts:   list, get, create, update, delete
 *   Companies:  list, get, create, update, delete
 *   Deals:      list, get, create, update, delete
 *   Pipelines:  list, get
 *   Activities: list, get
 *   Notes:      list, get, create, update, delete
 *   Auth:       getAuthUrl (N/A — API key), exchangeCode (N/A), refreshCredentials (N/A)
 *   Webhooks:   verifyWebhook, parseWebhookEvents
 *
 * Omitted (3) — registry returns HTTP 501 automatically:
 *   Activities: create, update, delete (interactions are read-only in Affinity)
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { AffinityClient } from './client'
import { MAX_PAGE_SIZE } from './constants'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { transformContact, untransformContact, type RawAffinityContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawAffinityCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawAffinityDeal } from './transform/deal'
import { transformPipeline, type RawAffinityList } from './transform/pipeline'
import {
  transformActivity,
  parseActivityId,
  INTERACTION_KINDS,
  INTERACTION_PATHS,
  type AffinityInteraction,
  type AffinityInteractionKind,
  type RawAffinityMeeting,
} from './transform/activity'
import { transformNote, untransformNote, type RawAffinityNote } from './transform/note'

/** Where the merged interaction stream continues: the kind, and its v2 cursor (absent: its first page). */
type InteractionCursor = { kind: AffinityInteractionKind; cursor?: string }

export interface AffinityAdapterConfig {
  /** Affinity API key — stored in credentials.accessToken. */
  apiKey?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()

export class AffinityAdapter implements CrmAdapter {
  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'affinity'
  readonly version = '0.1.0'

  private staticApiKey: string | undefined

  constructor(config: AffinityAdapterConfig = {}) {
    this.staticApiKey = config.apiKey
  }

  // ── Auth (API-key — no OAuth) ──────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return '#api-key-auth'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return { accessToken: this.staticApiKey ?? '' }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private effective(credentials: Credentials): Credentials {
    return this.staticApiKey ? { accessToken: this.staticApiKey } : credentials
  }

  private client(credentials: Credentials): AffinityClient {
    return new AffinityClient(this.effective(credentials))
  }

  /**
   * One caller page of a v2 cursor-paged collection. v2 pages with `cursor` +
   * `limit` (maximum 100) and signals the next page with
   * `pagination.nextUrl`, so upstream page k IS caller page k at the size sent.
   * `limit` is always sent: /v2/notes defaults to 20, the others to 100.
   */
  private async pageV2<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
  ): Promise<T[]> {
    const asked =
      typeof params.limit === 'number' && params.limit >= 1
        ? Math.floor(params.limit)
        : MAX_PAGE_SIZE
    const limit = Math.min(asked, MAX_PAGE_SIZE)
    const client = this.client(credentials)
    const key = cursorPagerKey(connectionScope('affinity', this.effective(credentials)), path, {
      limit,
    })
    const { items, hasMore } = await pageByCursor<T>(key, params.page, async (cursor) => {
      const res = await client.listV2<T>(path, limit, cursor)
      return { items: res.items, next: res.nextCursor }
    })
    reportUpstreamPage(params, { hasMore, pageSize: limit })
    return items
  }

  // ── Contacts (Persons) ────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const items = await this.pageV2<RawAffinityContact>(credentials, '/v2/persons', params)
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawAffinityContact>(`/v2/persons/${id}`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    // Affinity requires first_name at minimum
    if (!body.first_name && data.name) body.first_name = data.name
    const raw = await this.client(credentials).post<RawAffinityContact>('/v2/persons', body)
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const raw = await this.client(credentials).patch<RawAffinityContact>(
      `/v2/persons/${id}`,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/v2/persons/${id}`)
  }

  // ── Companies (Organizations) ─────────────────────────────────────────────

  // v2 has no /organizations (the v1 name). GET /v2/companies: "Paginate
  // through Companies in Affinity." GET /v2/companies/{companyId}: "Returns
  // basic information and non-list-specific field data on the requested
  // Company." The write methods below still call /v2/organizations, which v2
  // does not have; they are outside the read rebuild.

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const items = await this.pageV2<RawAffinityCompany>(credentials, '/v2/companies', params)
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawAffinityCompany>(
      `/v2/companies/${encodeURIComponent(id)}`,
    )
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).post<RawAffinityCompany>(
      '/v2/organizations',
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const raw = await this.client(credentials).patch<RawAffinityCompany>(
      `/v2/organizations/${id}`,
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/v2/organizations/${id}`)
  }

  // ── Deals (Opportunities) ─────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const items = await this.pageV2<RawAffinityDeal>(credentials, '/v2/opportunities', params)
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawAffinityDeal>(`/v2/opportunities/${id}`)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).post<RawAffinityDeal>(
      '/v2/opportunities',
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).patch<RawAffinityDeal>(
      `/v2/opportunities/${id}`,
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/v2/opportunities/${id}`)
  }

  // ── Pipelines (Lists) ─────────────────────────────────────────────────────

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const items = await this.pageV2<RawAffinityList>(credentials, '/v2/lists', params)
    return items.map(transformPipeline)
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const raw = await this.client(credentials).get<RawAffinityList>(`/v2/lists/${id}`)
    return transformPipeline(raw)
  }

  // ── Activities (Interactions — read-only) ─────────────────────────────────

  /**
   * v2 has no /interactions (the v1 name). It lists each kind separately —
   * GET /v2/emails, /v2/calls, /v2/meetings, /v2/chat-messages, each paged
   * with `cursor` + `limit` ("maximum: 100") and ended by a null
   * `pagination.nextUrl` — so the activities are those four lists streamed in
   * that order, and the row pager cuts the caller's page out of them. Each
   * upstream page is the documented maximum, whatever the caller's limit, so
   * the walk is shared across page sizes.
   */
  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const client = this.client(credentials)
    const key = cursorPagerKey(
      connectionScope('affinity', this.effective(credentials)),
      'interactions',
      {
        limit: MAX_PAGE_SIZE,
      },
    )
    const { items } = await pageByRows<AffinityInteraction, InteractionCursor>(
      key,
      params,
      async (at) => {
        const kind = at?.kind ?? INTERACTION_KINDS[0]
        const res = await client.listV2<AffinityInteraction['raw']>(
          INTERACTION_PATHS[kind],
          MAX_PAGE_SIZE,
          at?.cursor,
        )
        const rows = res.items.map((raw) => ({ kind, raw }) as AffinityInteraction)
        if (res.nextCursor) return { items: rows, next: { kind, cursor: res.nextCursor } }
        const following = INTERACTION_KINDS[INTERACTION_KINDS.indexOf(kind) + 1]
        return { items: rows, next: following ? { kind: following } : undefined }
      },
    )
    return items.map(transformActivity)
  }

  /**
   * A meeting has GET /v2/meetings/{meetingId}. Emails, calls and chat
   * messages have no by-id path; their lists take a `filter` on the
   * documented `id` property ("`id=1|id=2|id=3`").
   */
  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const ref = parseActivityId(id)
    const client = this.client(credentials)
    if (ref.kind === 'meeting') {
      const raw = await client.get<RawAffinityMeeting>(`/v2/meetings/${ref.id}`)
      return transformActivity({ kind: 'meeting', raw })
    }
    const [raw] = await client.filterV2<AffinityInteraction['raw']>(
      INTERACTION_PATHS[ref.kind],
      `id=${ref.id}`,
    )
    if (!raw || raw.id !== ref.id) {
      throw Object.assign(new Error(`Affinity activity ${id} not found`), { statusCode: 404 })
    }
    return transformActivity({ kind: ref.kind, raw } as AffinityInteraction)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const items = await this.pageV2<RawAffinityNote>(credentials, '/v2/notes', params)
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.client(credentials).get<RawAffinityNote>(`/v2/notes/${id}`)
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).post<RawAffinityNote>(
      '/v2/notes',
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async updateNote(credentials: Credentials, id: string, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).patch<RawAffinityNote>(
      `/v2/notes/${id}`,
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/v2/notes/${id}`)
  }
}
