/**
 * Keap (Infusionsoft) adapter for the CRM vertical.
 *
 * Platform: Keap (formerly Infusionsoft)
 * API version: REST v2
 * Docs: https://developer.keap.com/docs/restv2/ (OpenAPI spec:
 *       https://crm.infusionsoft.com/app/v3/api-docs/V2)
 *
 * Coverage:
 *   - Contacts (list, get, create, update, delete)
 *   - Companies (list, get, create, update); delete not implemented
 *   - Deals / Opportunities (list, get, create, update, delete)
 *   - Pipelines — the account's one opportunity stage list (list, get)
 *   - Activities / Tasks (list, get, create, update, delete)
 *   - Notes — all notes or one contact's (list, get, create, delete)
 *   - Webhooks — HMAC-SHA256 verification
 */

import {
  pageByCursor,
  cursorPagerKey,
  connectionScope,
  reportUpstreamPage,
  pageLocally,
} from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { KeapClient } from './client'
import {
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  refreshCredentials as doRefresh,
} from './auth'
import { verifyKeapWebhook, parseKeapWebhookEvents } from './webhook'
import { KEAP_AUTH_URL, KEAP_DEFAULT_LIMIT, KEAP_MAX_PAGE_SIZE } from './constants'
import { transformContact, untransformContact, type RawKeapContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawKeapCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawKeapOpportunity } from './transform/deal'
import { transformPipeline, type RawKeapOpportunityStage } from './transform/pipeline'
import { transformActivity, untransformActivity, type RawKeapTask } from './transform/activity'
import { transformNote, untransformNote, type RawKeapNote } from './transform/note'

/** Every Company property transformCompany reads (see listCompanies). */
const KEAP_COMPANY_LIST_FIELDS =
  'id,company_name,website,owner_id,phone_number,create_time,update_time'

export interface KeapAdapterConfig {
  /** OAuth2 client ID. */
  clientId?: string
  /** OAuth2 client secret. */
  clientSecret?: string
  /** OAuth2 redirect URI. */
  redirectUri?: string
}

export class KeapAdapter implements CrmAdapter {
  readonly platform = 'keap'
  readonly version = '0.1.0'

  private clientId: string | undefined
  private clientSecret: string | undefined
  private redirectUri: string | undefined

  constructor(config: KeapAdapterConfig = {}) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    if (!this.clientId || !this.redirectUri) {
      const url = new URL(KEAP_AUTH_URL)
      url.searchParams.set('state', state)
      return url.toString()
    }
    return buildAuthUrl(
      {
        clientId: this.clientId,
        clientSecret: this.clientSecret ?? '',
        redirectUri: this.redirectUri,
        scopes: overrideScopes,
      },
      state,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Keap exchangeCode: clientId and clientSecret required')
    }
    return doExchangeCode(
      {
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        redirectUri: this.redirectUri ?? redirectUri,
      },
      code,
      redirectUri,
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Prefer config-level secrets; fall back to credentials.extra
    const creds: Credentials = {
      ...credentials,
      extra: {
        clientId: this.clientId ?? credentials.extra?.['clientId'],
        clientSecret: this.clientSecret ?? credentials.extra?.['clientSecret'],
        ...credentials.extra,
      },
    }
    return doRefresh(creds)
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyKeapWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseKeapWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): KeapClient {
    return new KeapClient(credentials)
  }

  /**
   * One caller page of a v2 list. Keap v2 pages with `page_token` (from the
   * previous response's `next_page_token`) and `page_size` (maximum 1000);
   * it documents no `limit`. Upstream page k IS caller page k at the size
   * sent, so the pager walks the token chain to the caller's `page`.
   */
  private async pageV2<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    extra: Record<string, string> = {},
  ): Promise<T[]> {
    const asked =
      typeof params.limit === 'number' && params.limit >= 1
        ? Math.floor(params.limit)
        : KEAP_DEFAULT_LIMIT
    const pageSize = Math.min(asked, KEAP_MAX_PAGE_SIZE)
    const client = this.client(credentials)
    const key = cursorPagerKey(connectionScope('keap', credentials), path, {
      ...extra,
      limit: pageSize,
    })
    const { items, hasMore } = await pageByCursor<T>(key, params.page, async (cursor) => {
      const res = await client.list<T>(path, { ...extra, page_size: pageSize, page_token: cursor })
      return { items: res.items, next: res.nextPageToken || undefined }
    })
    reportUpstreamPage(params, { hasMore, pageSize })
    return items
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const items = await this.pageV2<RawKeapContact>(credentials, '/contacts', params)
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawKeapContact>(`/contacts/${id}`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).post<RawKeapContact>('/contacts', body)
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const raw = await this.client(credentials).patch<RawKeapContact>(
      `/contacts/${id}`,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contacts/${id}`)
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    // listCompanies `fields`: "(Fields such as `notes`, `fax_number`, `address`,
    // `email_address`, `phone_number`, `update_time`, `create_time` and
    // `custom_fields` aren't included, by default.)" The spec does not say
    // whether `fields` adds to or replaces the default set, so it names every
    // property the transform reads.
    const items = await this.pageV2<RawKeapCompany>(credentials, '/companies', params, {
      fields: KEAP_COMPANY_LIST_FIELDS,
    })
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawKeapCompany>(`/companies/${id}`)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).post<RawKeapCompany>(
      '/companies',
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const raw = await this.client(credentials).patch<RawKeapCompany>(
      `/companies/${id}`,
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  // The v2 spec documents DELETE /rest/v2/companies/{company_id} (deleteCompany);
  // this adapter does not implement it.

  // ── Deals (Opportunities) ─────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const items = await this.pageV2<RawKeapOpportunity>(credentials, '/opportunities', params)
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawKeapOpportunity>(`/opportunities/${id}`)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).post<RawKeapOpportunity>(
      '/opportunities',
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).put<RawKeapOpportunity>(
      `/opportunities/${id}`,
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/opportunities/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────
  // Keap has one opportunity pipeline per account: its stage list,
  // GET /rest/v2/opportunities/stages (operationId listOpportunityStages),
  // cursor-paged by page_token / page_size (maximum 1000) with
  // next_page_token. The adapter serves it as the single pipeline 'default'.

  /** Every stage of the account, walking the next_page_token chain to its end. */
  private async allStages(credentials: Credentials): Promise<RawKeapOpportunityStage[]> {
    const client = this.client(credentials)
    const stages: RawKeapOpportunityStage[] = []
    const seen = new Set<string>()
    let token: string | undefined
    for (;;) {
      const res = await client.list<RawKeapOpportunityStage>('/opportunities/stages', {
        page_size: KEAP_MAX_PAGE_SIZE,
        page_token: token,
      })
      stages.push(...res.items)
      const next = res.nextPageToken || undefined
      if (next === undefined) return stages
      if (seen.has(next)) {
        throw new Error(
          'Keap listOpportunityStages: next_page_token repeated; stage list is not advancing',
        )
      }
      seen.add(next)
      token = next
    }
  }

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    return pageLocally([transformPipeline(await this.allStages(credentials))], params)
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    if (id !== 'default') {
      throw Object.assign(new Error(`Keap: pipeline '${id}' not found`), { statusCode: 404 })
    }
    return transformPipeline(await this.allStages(credentials))
  }

  // ── Activities (Tasks) ────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const items = await this.pageV2<RawKeapTask>(credentials, '/tasks', params)
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).get<RawKeapTask>(`/tasks/${id}`)
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    if (!body.title) body.title = 'Task'
    const raw = await this.client(credentials).post<RawKeapTask>('/tasks', body)
    return transformActivity(raw)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const raw = await this.client(credentials).patch<RawKeapTask>(
      `/tasks/${id}`,
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/tasks/${id}`)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  // GET /rest/v2/notes (operationId listAllNotes) lists every note; GET
  // /rest/v2/contacts/{contact_id}/notes (operationId listNotes) one
  // contact's. Both page by page_token / page_size with next_page_token.

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const raw = params['contact_id']
    const contactId = typeof raw === 'string' && raw !== '' ? raw : undefined
    const path = contactId ? `/contacts/${encodeURIComponent(contactId)}/notes` : '/notes'
    const items = await this.pageV2<RawKeapNote>(credentials, path, params)
    return items.map((n) => transformNote(n, contactId))
  }

  /**
   * Keap v2 reads a single note only under its contact
   * (/contacts/{contact_id}/notes/{note_id}); by note id alone it is
   * listAllNotes with the documented `filter=id==<id>`.
   */
  async getNote(credentials: Credentials, id: string): Promise<Note> {
    // `;` joins filters and `*` is a wildcard in Keap's filter syntax.
    if (/[;*,]/.test(id)) {
      throw Object.assign(new Error(`Keap: note '${id}' not found`), { statusCode: 404 })
    }
    const { items } = await this.client(credentials).list<RawKeapNote>('/notes', {
      filter: `id==${id}`,
    })
    const raw = items.find((n) => String(n.id) === id)
    if (!raw) {
      throw Object.assign(new Error(`Keap: note '${id}' not found`), { statusCode: 404 })
    }
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const contactId = data.contact_id
    if (!contactId) {
      throw new Error('Keap createNote: contact_id is required')
    }
    const body = untransformNote(data)
    const raw = await this.client(credentials).post<RawKeapNote>(
      `/contacts/${contactId}/notes`,
      body,
    )
    return transformNote(raw, contactId)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/notes/${id}`)
  }
}
