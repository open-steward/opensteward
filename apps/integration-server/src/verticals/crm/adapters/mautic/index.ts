/**
 * Mautic adapter for the CRM vertical.
 *
 * Maps the Mautic REST API to canonical CRM resources.
 * Docs: https://developer.mautic.org/#rest-api
 *
 * Auth: OAuth2 (Bearer token)
 * Base URL: credentials.extra.instanceUrl ?? 'https://demo.mautic.org'
 * API path: /api/
 * Notable:
 *   - Open-source self-hosted marketing automation with CRM features
 *   - Contacts (leads), Companies, Segments (mapped to Pipelines)
 *   - No native deals — listDeals/getDeal/createDeal/updateDeal/deleteDeal return [] or throw
 *   - Activities: form submissions / contact events
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented:
 *   Contacts: list, get, create, update, delete
 *   Companies: list, get, create, update, delete
 *   Deals: list returns [], write methods throw
 *   Pipelines (Segments): list
 *   Activities: list (contact activity log)
 *   Notes: list, get, create
 *   Webhooks: stub
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { connectionScope, cursorPagerKey, pageByRows, reportUpstreamPage } from '@opensteward/shared'

import { MauticClient } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { ACTIVITY_UPSTREAM_LIMIT, DEFAULT_INSTANCE_URL, DEFAULT_PAGE_SIZE } from './constants'
import { transformContact, untransformContact, type RawMauticContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawMauticCompany } from './transform/company'
import { transformSegmentAsPipeline, type RawMauticSegment } from './transform/pipeline'
import { transformActivity, type RawMauticActivity } from './transform/activity'
import { transformNote, untransformNote, type RawMauticNote } from './transform/note'

export interface MauticAdapterConfig {
  instanceUrl?: string
}

export class MauticAdapter implements CrmAdapter {
  readonly platform = 'mautic'
  readonly version = '0.1.0'

  constructor(_config: MauticAdapterConfig = {}) {}

  // ── Auth (OAuth2) ─────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return '#oauth2-auth'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return { accessToken: '' }
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

  private client(credentials: Credentials): MauticClient {
    return new MauticClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const limit = Number(params['limit'] ?? DEFAULT_PAGE_SIZE)
    const page = Number(params['page'] ?? 1)
    const start = (page - 1) * limit
    return { limit, start }
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const { items } = await this.client(credentials).list<RawMauticContact>(
      '/contacts',
      this.listParams(params),
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<RawMauticContact>(`/contacts/${id}`)
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).post<RawMauticContact>('/contacts/new', body)
    return transformContact(res)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).put<RawMauticContact>(`/contacts/${id}/edit`, body)
    return transformContact(res)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contacts/${id}/delete`)
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const { items } = await this.client(credentials).list<RawMauticCompany>(
      '/companies',
      this.listParams(params),
    )
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const res = await this.client(credentials).get<RawMauticCompany>(`/companies/${id}`)
    return transformCompany(res)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).post<RawMauticCompany>('/companies/new', body)
    return transformCompany(res)
  }

  async updateCompany(credentials: Credentials, id: string, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).put<RawMauticCompany>(`/companies/${id}/edit`, body)
    return transformCompany(res)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/companies/${id}/delete`)
  }

  // ── Deals (not supported in Mautic) ───────────────────────────────────────

  async listDeals(_credentials: Credentials, _params: QueryParams): Promise<Deal[]> {
    return []
  }

  // ── Pipelines (Segments) ──────────────────────────────────────────────────

  /**
   * GET /segments pages by offset: `start` is "Starting row for the returned
   * entities - defaults to 0", `limit` the page size, and `total` is "Total
   * count of Segments" (https://devdocs.mautic.org/en/5.x/rest_api/segments.html).
   */
  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const query = this.listParams(params)
    try {
      const { items, raw } = await this.client(credentials).list<RawMauticSegment>('/segments', query)
      const total = Number(raw['total'])
      if (Number.isFinite(total)) {
        reportUpstreamPage(params, {
          totalCount: total,
          hasMore: Number(query['start']) + Number(query['limit']) < total,
        })
      }
      return items.map(transformSegmentAsPipeline)
    } catch (e: unknown) {
      if ((e as { statusCode?: number }).statusCode === 404) return []
      throw e
    }
  }

  // ── Activities ────────────────────────────────────────────────────────────

  /**
   * GET /contacts/activity pages by `page` ("What page number to load") and
   * ends at `maxPages` ("How many pages of events are there";
   * https://devdocs.mautic.org/en/5.x/rest_api/contacts.html). Mautic applies
   * `limit` PER EVENT TYPE and merges the types, so one upstream page holds up
   * to `limit` × types rows. The upstream is walked at a fixed per-type limit
   * and the caller's page is cut from that row stream.
   */
  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const client = this.client(credentials)
    const instance = (credentials.extra?.['instanceUrl'] as string | undefined) ?? DEFAULT_INSTANCE_URL
    const key = cursorPagerKey(connectionScope(instance, credentials), 'contacts/activity', {
      upstreamLimit: ACTIVITY_UPSTREAM_LIMIT,
    })
    try {
      const { items } = await pageByRows<Activity, number>(
        key,
        params,
        async (cursor) => {
          const page = cursor ?? 1
          const { items: fallback, raw } = await client.fetchPage<RawMauticActivity>(
            '/contacts/activity',
            { page, limit: ACTIVITY_UPSTREAM_LIMIT },
          )
          const events = Array.isArray(raw['events'])
            ? (raw['events'] as RawMauticActivity[])
            : fallback
          const maxPages = Number(raw['maxPages'])
          const more = events.length > 0 && Number.isFinite(maxPages) && page < maxPages
          return { items: events.map(transformActivity), next: more ? page + 1 : null }
        },
        { defaultLimit: DEFAULT_PAGE_SIZE },
      )
      return items
    } catch (e: unknown) {
      if ((e as { statusCode?: number }).statusCode === 404) return []
      throw e
    }
  }

  async getActivity(_credentials: Credentials, _id: string): Promise<Activity> {
    // Mautic has no single-event endpoint; stub as unsupported
    throw new Error('mautic: getActivity not supported')
  }

  async createActivity(_credentials: Credentials, _data: Partial<Activity>): Promise<Activity> {
    // TODO: Mautic does not expose a direct POST /events endpoint
    throw new Error('mautic: createActivity not supported')
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const { items } = await this.client(credentials).list<RawMauticNote>(
      '/notes',
      this.listParams(params),
    )
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const res = await this.client(credentials).get<RawMauticNote>(`/notes/${id}`)
    return transformNote(res)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const res = await this.client(credentials).post<RawMauticNote>('/notes/new', body)
    return transformNote(res)
  }
}
