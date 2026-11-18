/**
 * HighLevel adapter — OAuth2 CRM integration.
 *
 * Coverage:
 *   contacts   — list, get, create, update, delete
 *   companies  — list, get (HighLevel "businesses"); create, update and
 *                delete still call undocumented /companies/ paths
 *   deals      — list, get, create, update, delete  (HighLevel "opportunities")
 *   pipelines  — list, get
 *   activities — NOT SUPPORTED (returns 501 automatically)
 *   notes      — list, get, create, update, delete  (contact-scoped)
 *   webhooks   — no HMAC signing; verifyWebhook always returns true
 *
 * Auth: OAuth2 Authorization Code. The locationId is stored in
 * `credentials.extra.locationId` after the initial token exchange.
 * `clientId` and `clientSecret` are also stored in `credentials.extra`.
 *
 * All requests require the `Version: 2021-07-28` header (sent by the client).
 *
 * Docs: https://highlevel.stoplight.io/docs/integrations/
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Note } from '../../schema/note'

import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  pageLocally,
  pageOffset,
  reportUpstreamPage,
} from '@opensteward/shared'

import { HighLevelClient } from './client'
import { buildAuthUrl, exchangeCode, refreshToken } from './auth'
import { verifyHighLevelWebhook, parseHighLevelWebhookEvents } from './webhook'
import { HL_DEFAULT_LIMIT, HL_MAX_PAGE_SIZE } from './constants'

import { transformContact, untransformContact, type RawHighLevelContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawHighLevelCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawHighLevelDeal } from './transform/deal'
import { transformPipeline, type RawHighLevelPipeline } from './transform/pipeline'
import { transformNote, untransformNote, type RawHighLevelNote } from './transform/note'

export interface HighLevelAdapterConfig {
  /** OAuth2 client id */
  clientId?: string
  /** OAuth2 client secret */
  clientSecret?: string
  /** OAuth2 redirect URI */
  redirectUri?: string
  /** OAuth2 scope override */
  scope?: string
}

export class HighLevelAdapter implements CrmAdapter {
  readonly platform = 'highlevel'
  readonly version = '0.1.0'

  private clientId: string | undefined
  private clientSecret: string | undefined
  private redirectUri: string | undefined
  private scope: string | undefined

  constructor(config: HighLevelAdapterConfig = {}) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scope = config.scope
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    const scopeStr = overrideScopes ? overrideScopes.join(' ') : this.scope
    return buildAuthUrl({
      clientId: this.clientId ?? '',
      redirectUri: this.redirectUri ?? '',
      state,
      scope: scopeStr,
    })
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('HighLevel exchangeCode: clientId and clientSecret required')
    }
    return exchangeCode({
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      redirectUri,
      code,
    })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshToken(credentials)
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyHighLevelWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseHighLevelWebhookEvents(payload)
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private client(credentials: Credentials): HighLevelClient {
    return new HighLevelClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      limit: params.limit ?? HL_DEFAULT_LIMIT,
    }
    if (params['startAfter']) out.startAfter = params['startAfter']
    if (params['startAfterId']) out.startAfterId = params['startAfterId']
    if (params['cursor']) out.startAfterId = params['cursor']
    return out
  }

  /** The upstream page size: the caller's limit, at most HighLevel's documented 100. */
  private upstreamSize(params: QueryParams): number {
    const asked = Number(params.limit ?? HL_DEFAULT_LIMIT)
    return Math.min(Math.max(1, Math.floor(asked)), HL_MAX_PAGE_SIZE)
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  /**
   * GET /contacts/ pages by keyset: `startAfterId` + `startAfter`, both taken
   * from the previous response's `meta`, with `limit` at most 100. The caller's
   * limit is not capped by the router here, so pageByRows cuts the caller's
   * page out of upstream pages of min(limit, 100).
   */
  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = this.client(credentials)
    const locationId = client.locationId
    const size = this.upstreamSize(params)
    const key = cursorPagerKey(connectionScope(locationId, credentials), 'contacts', {
      limit: size,
    })
    let total: number | undefined
    const { items } = await pageByRows<Contact, HighLevelContactCursor>(
      key,
      params,
      async (cursor) => {
        const {
          items: raw,
          meta,
          count,
        } = await client.list<RawHighLevelContact>('/contacts/', 'contacts', {
          locationId,
          limit: size,
          ...(cursor ? { startAfter: cursor.startAfter, startAfterId: cursor.startAfterId } : {}),
        })
        total = countOf(count) ?? countOf(meta?.['total']) ?? total
        return { items: raw.map(transformContact), next: nextContactCursor(raw.length, size, meta) }
      },
      { defaultLimit: HL_DEFAULT_LIMIT },
    )
    if (total !== undefined) reportUpstreamPage(params, { totalCount: total })
    return items
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<{ contact: RawHighLevelContact }>(
      `/contacts/${id}`,
    )
    return transformContact(raw.contact)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = this.client(credentials)
    const body = untransformContact(data, client.locationId)
    const res = await client.post<{ contact: RawHighLevelContact }>('/contacts/', body)
    return transformContact(res.contact)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = this.client(credentials)
    const body = untransformContact(data, client.locationId)
    const res = await client.put<{ contact: RawHighLevelContact }>(`/contacts/${id}`, body)
    return transformContact(res.contact)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contacts/${id}`)
  }

  // ── Companies ──────────────────────────────────────────────────────────────

  /**
   * HighLevel's Companies API documents only GET /companies/:companyId, an
   * Agency-level read of the agency account. A sub-account's companies are its
   * Businesses: GET /businesses/ ("Get Businesses by Location") takes
   * `locationId` (required), `limit` (default 100) and `skip` (default 0), and
   * returns `businesses` with no total, next marker or stated maximum. It pages
   * by offset at the caller's limit; only a short page says the rows ended.
   */
  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const client = this.client(credentials)
    const locationId = client.locationId
    const size = callerSize(params)
    const { items } = await client.list<RawHighLevelCompany>('/businesses/', 'businesses', {
      locationId,
      limit: size,
      skip: pageOffset(params, size),
    })
    if (items.length < size) reportUpstreamPage(params, { hasMore: false })
    return items.map(transformCompany)
  }

  /** GET /businesses/:businessId ("Get Business") returns `{ business }`. */
  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const res = await this.client(credentials).get<{ business: RawHighLevelCompany }>(
      `/businesses/${encodeURIComponent(id)}`,
    )
    if (!res.business) throw new Error(`HighLevel Get Business returned no business for ${id}`)
    return transformCompany(res.business)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const client = this.client(credentials)
    const body = untransformCompany(data, client.locationId)
    const res = await client.post<{ company: RawHighLevelCompany }>('/companies/', body)
    return transformCompany(res.company)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const client = this.client(credentials)
    const body = untransformCompany(data, client.locationId)
    const res = await client.put<{ company: RawHighLevelCompany }>(`/companies/${id}`, body)
    return transformCompany(res.company)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/companies/${id}`)
  }

  // ── Deals (Opportunities) ──────────────────────────────────────────────────

  /**
   * GET /opportunities/search pages by `page` and `limit` (at most 100); the
   * end comes from `meta.nextPage` / `meta.total`. The caller's limit is not
   * capped by the router here, so pageByRows cuts the caller's page out of
   * upstream pages of min(limit, 100).
   */
  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const client = this.client(credentials)
    const locationId = client.locationId
    const size = this.upstreamSize(params)
    const key = cursorPagerKey(connectionScope(locationId, credentials), 'deals', { limit: size })
    let total: number | undefined
    const { items } = await pageByRows<Deal, number>(
      key,
      params,
      async (cursor) => {
        const page = cursor ?? 1
        const { items: raw, meta } = await client.list<RawHighLevelDeal>(
          '/opportunities/search',
          'opportunities',
          { location_id: locationId, page, limit: size },
        )
        total = countOf(meta?.['total']) ?? total
        return { items: raw.map(transformDeal), next: nextDealPage(page, raw.length, size, meta) }
      },
      { defaultLimit: HL_DEFAULT_LIMIT },
    )
    if (total !== undefined) reportUpstreamPage(params, { totalCount: total })
    return items
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const res = await this.client(credentials).get<{ opportunity: RawHighLevelDeal }>(
      `/opportunities/${id}`,
    )
    return transformDeal(res.opportunity)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const client = this.client(credentials)
    const body = untransformDeal(data, client.locationId)
    const res = await client.post<{ opportunity: RawHighLevelDeal }>('/opportunities/', body)
    return transformDeal(res.opportunity)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const client = this.client(credentials)
    const body = untransformDeal(data, client.locationId)
    const res = await client.put<{ opportunity: RawHighLevelDeal }>(`/opportunities/${id}`, body)
    return transformDeal(res.opportunity)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/opportunities/${id}`)
  }

  // ── Pipelines ──────────────────────────────────────────────────────────────

  /** GET /opportunities/pipelines takes no paging parameters and returns every pipeline. */
  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const client = this.client(credentials)
    const { items } = await client.list<RawHighLevelPipeline>(
      '/opportunities/pipelines/',
      'pipelines',
      { locationId: client.locationId },
    )
    return pageLocally(items.map(transformPipeline), params)
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    // HighLevel has no single-pipeline endpoint; filter from the list
    const all = await this.listPipelines(credentials, {})
    const found = all.find((p) => p.id === id)
    if (!found) {
      throw Object.assign(new Error(`HighLevel: pipeline ${id} not found`), { statusCode: 404 })
    }
    return found
  }

  // ── Activities ─────────────────────────────────────────────────────────────
  // HighLevel has no general activity model — methods omitted; registry returns 501.

  // ── Notes ──────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const contactId = params['contact_id'] as string | undefined
    if (!contactId) throw new Error('HighLevel listNotes: contact_id param is required')
    const { items } = await this.client(credentials).list<RawHighLevelNote>(
      `/contacts/${contactId}/notes`,
      'notes',
      this.listParams(params),
    )
    return items.map((raw) => transformNote(raw, contactId))
  }

  async getNote(credentials: Credentials, id: string, params?: QueryParams): Promise<Note> {
    const contactId = params?.['contact_id'] as string | undefined
    if (!contactId) throw new Error('HighLevel getNote: contact_id param is required')
    const res = await this.client(credentials).get<{ note: RawHighLevelNote }>(
      `/contacts/${contactId}/notes/${id}`,
    )
    return transformNote(res.note, contactId)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const contactId = data.contact_id
    if (!contactId) throw new Error('HighLevel createNote: contact_id is required')
    const body = untransformNote(data)
    const res = await this.client(credentials).post<{ note: RawHighLevelNote }>(
      `/contacts/${contactId}/notes`,
      body,
    )
    return transformNote(res.note, contactId)
  }

  async updateNote(credentials: Credentials, id: string, data: Partial<Note>): Promise<Note> {
    const contactId = data.contact_id
    if (!contactId) throw new Error('HighLevel updateNote: contact_id is required in data')
    const body = untransformNote(data)
    const res = await this.client(credentials).put<{ note: RawHighLevelNote }>(
      `/contacts/${contactId}/notes/${id}`,
      body,
    )
    return transformNote(res.note, contactId)
  }

  async deleteNote(credentials: Credentials, id: string, params?: QueryParams): Promise<void> {
    const contactId = params?.['contact_id'] as string | undefined
    if (!contactId) throw new Error('HighLevel deleteNote: contact_id param is required')
    await this.client(credentials).delete(`/contacts/${contactId}/notes/${id}`)
  }
}

/** A row count the platform reported, when it is a whole number >= 0. */
function countOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined
}

/**
 * The caller's page size, sent as is to an endpoint with no stated maximum;
 * the adapter's default when the caller names none.
 */
function callerSize(params: QueryParams): number {
  const asked = Number(params.limit ?? HL_DEFAULT_LIMIT)
  return Number.isFinite(asked) && asked >= 1 ? Math.floor(asked) : HL_DEFAULT_LIMIT
}

/** The keyset GET /contacts/ resumes from, as its response `meta` names it. */
interface HighLevelContactCursor {
  startAfter: string | number
  startAfterId: string
}

/**
 * The next contacts keyset. A short page, an explicit null `meta.nextPageUrl`,
 * or a meta without both keyset halves ends the walk: no documented source
 * gives a fallback keyset.
 */
function nextContactCursor(
  rows: number,
  size: number,
  meta: Record<string, unknown> | undefined,
): HighLevelContactCursor | undefined {
  if (rows < size || !meta) return undefined
  if ('nextPageUrl' in meta && meta['nextPageUrl'] == null) return undefined
  const startAfterId = meta['startAfterId']
  const startAfter = meta['startAfter']
  if (typeof startAfterId !== 'string' || startAfterId === '') return undefined
  if (typeof startAfter !== 'string' && typeof startAfter !== 'number') return undefined
  return { startAfter, startAfterId }
}

/** The next opportunities page number, from `meta.nextPage`, else `meta.total`, else a full page. */
function nextDealPage(
  page: number,
  rows: number,
  size: number,
  meta: Record<string, unknown> | undefined,
): number | undefined {
  if (rows < size) return undefined
  if (meta && 'nextPage' in meta) return meta['nextPage'] == null ? undefined : page + 1
  const total = meta?.['total']
  if (typeof total === 'number') return page * size < total ? page + 1 : undefined
  return page + 1
}
