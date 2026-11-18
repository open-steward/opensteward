/**
 * HubSpot adapter — full CRM resource coverage for the OpenSteward CRM vertical.
 *
 * Maps the HubSpot CRM API v3 to canonical CRM resources (contacts, companies,
 * deals, pipelines, activities/tasks, notes). All CRUD operations are supported
 * where the HubSpot API allows them. Pagination uses HubSpot's cursor-based
 * `after` token. OAuth2 Bearer tokens are used for every request.
 *
 * Docs: https://developers.hubspot.com/docs/api/crm/
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { HubSpotClient } from './client'
import { buildAuthUrl, exchangeCode as doExchangeCode, refreshToken as doRefreshToken } from './auth'
import { verifyHubSpotWebhook, parseHubSpotWebhookEvents } from './webhook'
import {
  transformContact, untransformContact, type RawHubSpotContact,
} from './transform/contact'
import {
  transformCompany, untransformCompany, type RawHubSpotCompany,
} from './transform/company'
import {
  transformDeal, untransformDeal, type RawHubSpotDeal,
} from './transform/deal'
import {
  transformPipeline, type RawHubSpotPipeline,
} from './transform/pipeline'
import {
  transformActivity, untransformActivity, type RawHubSpotTask,
} from './transform/activity'
import {
  transformNote, untransformNote, type RawHubSpotNote,
} from './transform/note'
import {
  HUBSPOT_CONTACT_PROPERTIES,
  HUBSPOT_COMPANY_PROPERTIES,
  HUBSPOT_DEAL_PROPERTIES,
  HUBSPOT_TASK_PROPERTIES,
  HUBSPOT_NOTE_PROPERTIES,
  DEFAULT_HUBSPOT_SCOPES,
  MAX_HUBSPOT_PAGE_SIZE,
} from './constants'
import { pageLocally, reportUpstreamPage } from '@opensteward/shared'
import { listPageWithMore } from './cursor-pager'

export interface HubSpotAdapterConfig {
  /** OAuth2 client ID. */
  clientId?: string
  /** OAuth2 client secret. */
  clientSecret?: string
  /** OAuth2 redirect URI. */
  redirectUri?: string
  /** OAuth scopes to request. Defaults to DEFAULT_HUBSPOT_SCOPES when omitted. */
  scopes?: string[]
}

export class HubSpotAdapter implements CrmAdapter {
  readonly platform = 'hubspot'
  readonly version = '0.1.0'

  /**
   * HubSpot rejects anything above 100 outright:
   *   400 VALIDATION_ERROR — "You can only request at most 100 objects in one
   *   request." context: { limit: ["500"] }
   * which is the sync worker's default page size. Declaring it lets the worker
   * clamp its termination test to the same number it requests; clamping only
   * the query string would end every sync after one page.
   */
  readonly capabilities = { maxPageSize: MAX_HUBSPOT_PAGE_SIZE }

  private clientId: string | undefined
  private clientSecret: string | undefined
  private redirectUri: string | undefined
  private scopes: string[]

  constructor(config: HubSpotAdapterConfig = {}) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? [...DEFAULT_HUBSPOT_SCOPES]
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(
      {
        clientId: this.clientId ?? '',
        clientSecret: this.clientSecret ?? '',
        redirectUri: this.redirectUri ?? '',
        scopes: overrideScopes ?? this.scopes,
      },
      state,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('HubSpot exchangeCode: clientId and clientSecret required')
    }
    return doExchangeCode(
      { clientId: this.clientId, clientSecret: this.clientSecret, redirectUri },
      code,
      redirectUri,
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) return credentials
    const clientId = this.clientId ?? (credentials.extra as Record<string, string> | undefined)?.['clientId'] ?? ''
    const clientSecret = this.clientSecret ?? (credentials.extra as Record<string, string> | undefined)?.['clientSecret'] ?? ''
    return doRefreshToken({ clientId, clientSecret }, credentials)
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyHubSpotWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseHubSpotWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): HubSpotClient {
    return new HubSpotClient(credentials)
  }

  /**
   * Query params for a cursor-paginated list.
   *
   * The clamp is here as well as in the worker because the router reaches
   * these methods directly and does not consult `capabilities` — a caller
   * passing `limit=500` to `/v1/crm/contacts` would otherwise get the same
   * 400 the sync job hit.
   */
  private cursorParams(params: QueryParams): Record<string, unknown> {
    const requested = params.limit ?? 25
    const out: Record<string, unknown> = {
      limit: Math.min(requested, MAX_HUBSPOT_PAGE_SIZE),
    }
    if (params['cursor'] != null) out.after = params['cursor']
    if (params['after'] != null) out.after = params['after']
    return out
  }

  /**
   * One page, honouring EITHER an explicit cursor or the worker's `page`.
   *
   * An explicit `cursor`/`after` wins: a client paging by cursor is already
   * holding a position and should not have it recomputed. Otherwise `page` is
   * resolved through `listPage`, which walks HubSpot's `after` chain — see
   * cursor-pager.ts for why `page` cannot simply be dropped.
   */
  private async listCursor<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    extra: Record<string, unknown>,
  ): Promise<T[]> {
    const query = { ...this.cursorParams(params), ...extra }
    // HubSpot's `paging.next` is the authoritative end of a collection; the
    // sync worker trusts it over the short-page guess (UpstreamPageMeta.hasMore).
    if (query.after != null) {
      const { items, hasMore } = await this.client(credentials).list<T>(path, query)
      reportUpstreamPage(params, { hasMore })
      return items
    }
    const page = typeof params.page === 'number' ? params.page : 1
    const res = await listPageWithMore<T>(this.client(credentials), credentials, path, page, query)
    reportUpstreamPage(params, { hasMore: res.hasMore })
    return res.items
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const items = await this.listCursor<RawHubSpotContact>(
      credentials,
      '/crm/v3/objects/contacts',
      params,
      { properties: HUBSPOT_CONTACT_PROPERTIES },
    )
    return items.map((raw) => transformContact(raw))
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = this.client(credentials)
    const raw = await client.get<RawHubSpotContact>(
      `/crm/v3/objects/contacts/${id}`,
      { properties: HUBSPOT_CONTACT_PROPERTIES },
    )
    const companyId = await client.getFirstAssociation('contacts', id, 'company')
    return transformContact(raw, companyId)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).post<RawHubSpotContact>(
      '/crm/v3/objects/contacts',
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const raw = await this.client(credentials).patch<RawHubSpotContact>(
      `/crm/v3/objects/contacts/${id}`,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/crm/v3/objects/contacts/${id}`)
  }

  // ── Companies ──────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const items = await this.listCursor<RawHubSpotCompany>(
      credentials,
      '/crm/v3/objects/companies',
      params,
      { properties: HUBSPOT_COMPANY_PROPERTIES },
    )
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawHubSpotCompany>(
      `/crm/v3/objects/companies/${id}`,
      { properties: HUBSPOT_COMPANY_PROPERTIES },
    )
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).post<RawHubSpotCompany>(
      '/crm/v3/objects/companies',
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const raw = await this.client(credentials).patch<RawHubSpotCompany>(
      `/crm/v3/objects/companies/${id}`,
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/crm/v3/objects/companies/${id}`)
  }

  // ── Deals ──────────────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const items = await this.listCursor<RawHubSpotDeal>(
      credentials,
      '/crm/v3/objects/deals',
      params,
      { properties: HUBSPOT_DEAL_PROPERTIES },
    )
    return items.map((raw) => transformDeal(raw))
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const client = this.client(credentials)
    const raw = await client.get<RawHubSpotDeal>(
      `/crm/v3/objects/deals/${id}`,
      { properties: HUBSPOT_DEAL_PROPERTIES },
    )
    const contactId = await client.getFirstAssociation('deals', id, 'contact')
    return transformDeal(raw, contactId)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).post<RawHubSpotDeal>(
      '/crm/v3/objects/deals',
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async updateDeal(
    credentials: Credentials,
    id: string,
    data: Partial<Deal>,
  ): Promise<Deal> {
    const raw = await this.client(credentials).patch<RawHubSpotDeal>(
      `/crm/v3/objects/deals/${id}`,
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/crm/v3/objects/deals/${id}`)
  }

  // ── Pipelines ──────────────────────────────────────────────────────────────

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const items = await this.client(credentials).listPipelines<RawHubSpotPipeline>(
      '/crm/v3/pipelines/deals',
    )
    // Unpaginated upstream: paged locally, so a caller limit below the
    // pipeline count (the adapter declares maxPageSize 100) reaches each one.
    return pageLocally(items.map(transformPipeline), params)
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const raw = await this.client(credentials).get<RawHubSpotPipeline>(
      `/crm/v3/pipelines/deals/${id}`,
    )
    return transformPipeline(raw)
  }

  // ── Activities (Tasks) ─────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const items = await this.listCursor<RawHubSpotTask>(
      credentials,
      '/crm/v3/objects/tasks',
      params,
      { properties: HUBSPOT_TASK_PROPERTIES },
    )
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).get<RawHubSpotTask>(
      `/crm/v3/objects/tasks/${id}`,
      { properties: HUBSPOT_TASK_PROPERTIES },
    )
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const raw = await this.client(credentials).post<RawHubSpotTask>(
      '/crm/v3/objects/tasks',
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const raw = await this.client(credentials).patch<RawHubSpotTask>(
      `/crm/v3/objects/tasks/${id}`,
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/crm/v3/objects/tasks/${id}`)
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const client = this.client(credentials)
    const items = await this.listCursor<RawHubSpotNote>(
      credentials,
      '/crm/v3/objects/notes',
      params,
      { properties: HUBSPOT_NOTE_PROPERTIES },
    )
    // The list endpoint returns no associations, and a note reaches a record
    // ONLY through them — so without this every note comes back with empty
    // contact_id/company_id/deal_id, which the canonical schema advertises.
    // Three batch reads per page rather than three per note.
    const ids = items.map((raw) => String(raw.id))
    const [contacts, companies, deals] = await Promise.all([
      client.batchFirstAssociations('notes', 'contacts', ids),
      client.batchFirstAssociations('notes', 'companies', ids),
      client.batchFirstAssociations('notes', 'deals', ids),
    ])
    return items.map((raw) =>
      transformNote(raw, {
        contactId: contacts.get(String(raw.id)),
        companyId: companies.get(String(raw.id)),
        dealId: deals.get(String(raw.id)),
      }),
    )
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const client = this.client(credentials)
    const raw = await client.get<RawHubSpotNote>(
      `/crm/v3/objects/notes/${id}`,
      { properties: HUBSPOT_NOTE_PROPERTIES },
    )
    // Same three links as the list path. Reaching a note by id and by list
    // must not answer with different fields populated.
    const [contacts, companies, deals] = await Promise.all([
      client.batchFirstAssociations('notes', 'contacts', [id]),
      client.batchFirstAssociations('notes', 'companies', [id]),
      client.batchFirstAssociations('notes', 'deals', [id]),
    ])
    return transformNote(raw, {
      contactId: contacts.get(id),
      companyId: companies.get(id),
      dealId: deals.get(id),
    })
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).post<RawHubSpotNote>(
      '/crm/v3/objects/notes',
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async updateNote(
    credentials: Credentials,
    id: string,
    data: Partial<Note>,
  ): Promise<Note> {
    const raw = await this.client(credentials).patch<RawHubSpotNote>(
      `/crm/v3/objects/notes/${id}`,
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/crm/v3/objects/notes/${id}`)
  }
}
