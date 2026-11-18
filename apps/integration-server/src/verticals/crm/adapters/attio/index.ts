/**
 * Attio adapter for the CRM vertical.
 *
 * Maps Attio v2 REST API to canonical CRM resources.
 * Docs: https://developers.attio.com/
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (16):
 *   Contacts:   listContacts, getContact, createContact, updateContact, deleteContact
 *   Companies:  listCompanies, getCompany, createCompany, updateCompany, deleteCompany
 *   Deals:      listDeals, getDeal, createDeal, updateDeal, deleteDeal
 *   Pipelines:  listPipelines, getPipeline
 *   Notes:      listNotes, getNote, createNote, deleteNote
 *   Auth:       getAuthUrl, exchangeCode, refreshCredentials
 *   Webhooks:   verifyWebhook, parseWebhookEvents
 *
 * Omitted (5) — registry returns HTTP 501 automatically:
 *   Activities: listActivities, getActivity, createActivity, updateActivity, deleteActivity
 *              (Attio v2 has no public activity/task API)
 *   Notes:      updateNote (Attio notes are immutable after creation)
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Note } from '../../schema/note'
import type { WebhookEvent } from '../../schema/webhook'

import { connectionScope, cursorPagerKey, pageByRows } from '@opensteward/shared'

import { AttioClient } from './client'
import { buildAuthUrl, exchangeCode as exchangeCodeHelper, refreshToken } from './auth'
import { verifyWebhook as verifyAttioWebhook, parseWebhookEvents as parseAttioEvents } from './webhook'
import { DEFAULT_PAGE_SIZE, NOTES_MAX_PAGE_SIZE } from './constants'

import { transformContact, untransformContact, type RawAttioContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawAttioCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawAttioDeal } from './transform/deal'
import { transformPipeline, type RawAttioPipeline } from './transform/pipeline'
import { transformNote, untransformNote, type RawAttioNote } from './transform/note'

export interface AttioAdapterConfig {
  /** OAuth2 client ID. */
  clientId?: string
  /** OAuth2 client secret. */
  clientSecret?: string
  /** OAuth2 redirect URI. */
  redirectUri?: string
}

export class AttioAdapter implements CrmAdapter {
  readonly platform = 'attio'
  readonly version = '0.1.0'
  /**
   * The one page maximum Attio documents: GET /v2/notes `limit`, "The
   * default is `10` and the maximum is `50`." The records query documents
   * only "Defaults to 500." Declared adapter-wide so the router and the sync
   * worker ask every list for a page the platform serves in one request.
   */
  readonly capabilities = { maxPageSize: NOTES_MAX_PAGE_SIZE }

  private clientId: string | undefined
  private clientSecret: string | undefined
  private redirectUri: string | undefined

  constructor(config: AttioAdapterConfig = {}) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, _overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId ?? '', this.redirectUri ?? '', state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Attio exchangeCode: clientId and clientSecret required')
    }
    return exchangeCodeHelper(code, this.clientId, this.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) return credentials
    if (!this.clientId || !this.clientSecret) return credentials
    return refreshToken(credentials.refreshToken, this.clientId, this.clientSecret)
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyAttioWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseAttioEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): AttioClient {
    return new AttioClient(credentials)
  }

  /**
   * One caller page of an Attio list, which pages by `limit` and `offset`
   * and answers with `{ data }` only. Records query
   * (https://docs.attio.com/rest-api/endpoint-reference/records/list-records),
   * body `offset`: "The number of results to skip over before returning.
   * Defaults to 0." Notes
   * (https://docs.attio.com/rest-api/endpoint-reference/notes/list-notes),
   * query `limit`: "The default is `10` and the maximum is `50`." The end
   * (https://docs.attio.com/rest-api/guides/pagination): "If the number of
   * results you receive is less than the value of the `limit` parameter ...
   * you have reached the end of the result set".
   *
   * Each upstream page asks for the caller's limit, clamped to `max`, so
   * a caller page is one upstream page unless the clamp applies. The row
   * pager cuts the caller's rows either way and peeks past a page that ends
   * exactly on a boundary, so `hasMore` is exact.
   */
  private pageByOffset<T>(
    credentials: Credentials,
    params: QueryParams,
    collection: string,
    max: number | undefined,
    fetchPage: (limit: number, offset: number) => Promise<T[]>,
  ): Promise<T[]> {
    const asked = Math.floor(Number(params.limit ?? DEFAULT_PAGE_SIZE))
    const size = max === undefined ? asked : Math.min(asked, max)
    const key = cursorPagerKey(connectionScope('attio', credentials), collection, {
      limit: size,
    })
    return pageByRows<T, number>(
      key,
      params,
      async (cursor) => {
        const offset = cursor ?? 0
        const items = await fetchPage(size, offset)
        return { items, next: items.length < size ? null : offset + size }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    ).then((r) => r.items)
  }

  // ── Contacts (People) ─────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    return this.pageByOffset(credentials, params, 'people', undefined, async (limit, offset) => {
      const { items } = await this.client(credentials).query<RawAttioContact>(
        '/objects/people/records/query',
        { limit, offset },
      )
      return items.map(transformContact)
    })
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawAttioContact>(
      `/objects/people/records/${id}`,
    )
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).post<RawAttioContact>(
      '/objects/people/records',
      body,
    )
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).patch<RawAttioContact>(
      `/objects/people/records/${id}`,
      body,
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/objects/people/records/${id}`)
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    return this.pageByOffset(credentials, params, 'companies', undefined, async (limit, offset) => {
      const { items } = await this.client(credentials).query<RawAttioCompany>(
        '/objects/companies/records/query',
        { limit, offset },
      )
      return items.map(transformCompany)
    })
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawAttioCompany>(
      `/objects/companies/records/${id}`,
    )
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const raw = await this.client(credentials).post<RawAttioCompany>(
      '/objects/companies/records',
      body,
    )
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const body = untransformCompany(data)
    const raw = await this.client(credentials).patch<RawAttioCompany>(
      `/objects/companies/records/${id}`,
      body,
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/objects/companies/records/${id}`)
  }

  // ── Deals ─────────────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    return this.pageByOffset(credentials, params, 'deals', undefined, async (limit, offset) => {
      const { items } = await this.client(credentials).query<RawAttioDeal>(
        '/objects/deals/records/query',
        { limit, offset },
      )
      return items.map(transformDeal)
    })
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawAttioDeal>(
      `/objects/deals/records/${id}`,
    )
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const raw = await this.client(credentials).post<RawAttioDeal>(
      '/objects/deals/records',
      body,
    )
    return transformDeal(raw)
  }

  async updateDeal(
    credentials: Credentials,
    id: string,
    data: Partial<Deal>,
  ): Promise<Deal> {
    const body = untransformDeal(data)
    const raw = await this.client(credentials).patch<RawAttioDeal>(
      `/objects/deals/records/${id}`,
      body,
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/objects/deals/records/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  async listPipelines(credentials: Credentials, _params: QueryParams): Promise<Pipeline[]> {
    // Attio has one implicit pipeline per workspace; synthesise from stage attribute
    const raw = await this.client(credentials).get<RawAttioPipeline>(
      '/objects/deals/attributes/stage',
    )
    return [transformPipeline(raw)]
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    // Attio only has one pipeline — validate the id matches
    if (id !== 'default') {
      throw Object.assign(
        new Error(`Attio: pipeline '${id}' not found — only 'default' exists`),
        { statusCode: 404 },
      )
    }
    const raw = await this.client(credentials).get<RawAttioPipeline>(
      '/objects/deals/attributes/stage',
    )
    return transformPipeline(raw)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    return this.pageByOffset(
      credentials,
      params,
      'notes',
      NOTES_MAX_PAGE_SIZE,
      async (limit, offset) => {
        const { items } = await this.client(credentials).list<RawAttioNote>('/notes', {
          limit,
          offset,
        })
        return items.map(transformNote)
      },
    )
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.client(credentials).get<RawAttioNote>(`/notes/${id}`)
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const raw = await this.client(credentials).post<RawAttioNote>('/notes', body)
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/notes/${id}`)
  }
}
