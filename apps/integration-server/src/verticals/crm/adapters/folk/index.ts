/**
 * Folk adapter for the CRM vertical.
 *
 * Reads follow Folk's public REST API as published at
 * https://developer.folk.app (OpenAPI: /schemas/2025-06-09.json):
 * base URL https://api.folk.app, every path under /v1, Bearer API-key auth,
 * list envelope `{ data: { items, pagination: { nextLink } } }`, single-record
 * envelope `{ data }`, opaque `cursor` paging with `limit` 1..100.
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Reads (documented):
 *   Contacts:   listContacts (GET /v1/people), getContact (GET /v1/people/{personId})
 *   Companies:  listCompanies (GET /v1/companies), getCompany (GET /v1/companies/{companyId})
 *   Notes:      listNotes (GET /v1/notes), getNote (GET /v1/notes/{noteId})
 *
 * Refused with 501 NOT_SUPPORTED, before any request:
 *   Deals:      listDeals, getDeal. Folk deals live inside a group
 *               (GET /v1/groups/{groupId}/{objectType}, groupId and objectType
 *               both required) and a connection carries neither.
 *   Pipelines:  listPipelines, getPipeline. The API has no pipeline resource.
 *
 * Writes (create/update/delete for contacts, companies, deals, notes) are
 * unchanged from the original adapter and still call paths the published
 * spec does not document; they are outside this rebuild.
 *
 * Omitted — registry returns HTTP 501 automatically:
 *   Activities: listActivities, getActivity, createActivity, updateActivity, deleteActivity
 *   Notes:      updateNote
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  reportUpstreamPage,
  simpleApiKey,
} from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Note } from '../../schema/note'
import type { WebhookEvent } from '../../schema/webhook'

import { FolkClient } from './client'
import {
  verifyWebhook as verifyFolkWebhook,
  parseWebhookEvents as parseFolkEvents,
} from './webhook'
import { MAX_PAGE_SIZE } from './constants'

import { transformContact, untransformContact, type RawFolkContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawFolkCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawFolkDeal } from './transform/deal'
import { transformNote, untransformNote, type RawFolkNote } from './transform/note'

export interface FolkAdapterConfig {
  /** Folk API key — stored in credentials.accessToken at runtime. */
  apiKey?: string
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/**
 * GET /v1/groups/{groupId}/{objectType} (api-reference/deals/list-deals.md):
 * groupId "The ID of the group the deals belong to." and objectType "The name
 * of a deal custom field", both `required: true`. There is no workspace-wide
 * deals list, and the connection holds only an API key.
 */
const DEALS_REFUSAL =
  'Folk cannot list deals: deals are read per group at GET /v1/groups/{groupId}/{objectType}, ' +
  'where groupId ("The ID of the group the deals belong to.") and objectType ("The name of a ' +
  'deal custom field") are required, and this connection has neither'

/** GET /v1/groups/{groupId}/{objectType}/{objectId} needs the same group and object type. */
const DEAL_REFUSAL =
  'Folk cannot read a deal by id: GET /v1/groups/{groupId}/{objectType}/{objectId} requires ' +
  'a groupId and objectType, and this connection has neither'

/** "pipeline" appears nowhere in https://developer.folk.app/schemas/2025-06-09.json. */
const PIPELINES_REFUSAL =
  'Folk cannot list pipelines: the Folk API (2025-06-09) documents no pipeline resource'

const PIPELINE_REFUSAL =
  'Folk cannot read a pipeline: the Folk API (2025-06-09) documents no pipeline resource'

/**
 * api-reference/authentication.md: "You can view and manage your API keys in
 * your workspace settings under the 'API' section" and "include the API key in
 * the `Authorization` header using the bearer token scheme". The key is stored
 * verbatim as credentials.accessToken, which FolkClient sends as the Bearer.
 */
const FOLK_API_KEY_FORM = simpleApiKey({
  helpText: 'Create an API key in your folk workspace settings, under the API section.',
})

export class FolkAdapter implements CrmAdapter {
  readonly platform = 'folk'
  readonly version = '0.1.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  constructor(_config: FolkAdapterConfig = {}) {}

  // ── Auth (API key via the Connect Link form, no OAuth flow) ──────────────

  credentialFields = FOLK_API_KEY_FORM.credentialFields

  exchangeCredentials = FOLK_API_KEY_FORM.exchangeCredentials

  /** Folk uses API keys; no OAuth2 auth URL. */
  getAuthUrl(_state: string): string {
    return 'https://app.folk.app/settings/api'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('Folk uses API key authentication — OAuth2 code exchange is not supported')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys do not expire
    return credentials
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyFolkWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseFolkEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): FolkClient {
    return new FolkClient(credentials)
  }

  /**
   * One caller page of a cursor-paged list. Upstream page k IS caller page k
   * at the size sent, so pageByCursor walks `pagination.nextLink` cursors and
   * `hasMore` is whether the platform returned a nextLink.
   */
  private async page<T>(credentials: Credentials, path: string, params: QueryParams): Promise<T[]> {
    const asked =
      typeof params.limit === 'number' && params.limit >= 1
        ? Math.floor(params.limit)
        : MAX_PAGE_SIZE
    const limit = Math.min(asked, MAX_PAGE_SIZE)
    const client = this.client(credentials)
    const key = cursorPagerKey(connectionScope('folk', credentials), path, { limit })
    const { items, hasMore } = await pageByCursor<T>(key, params.page, async (cursor) => {
      const res = await client.list<T>(path, limit, cursor)
      return { items: res.items, next: res.nextCursor }
    })
    reportUpstreamPage(params, { hasMore, pageSize: limit })
    return items
  }

  // ── Contacts (People) ─────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const items = await this.page<RawFolkContact>(credentials, '/v1/people', params)
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawFolkContact>(
      `/v1/people/${encodeURIComponent(id)}`,
    )
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).post<RawFolkContact>(
      '/contacts',
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const raw = await this.client(credentials).patch<RawFolkContact>(
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
    const items = await this.page<RawFolkCompany>(credentials, '/v1/companies', params)
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawFolkCompany>(
      `/v1/companies/${encodeURIComponent(id)}`,
    )
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).post<RawFolkCompany>(
      '/groups',
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const raw = await this.client(credentials).patch<RawFolkCompany>(
      `/groups/${id}`,
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/groups/${id}`)
  }

  // ── Deals ─────────────────────────────────────────────────────────────────

  async listDeals(_credentials: Credentials, _params: QueryParams): Promise<Deal[]> {
    throw notSupported(DEALS_REFUSAL)
  }

  async getDeal(_credentials: Credentials, _id: string): Promise<Deal> {
    throw notSupported(DEAL_REFUSAL)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).post<RawFolkDeal>('/deals', untransformDeal(data))
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).patch<RawFolkDeal>(
      `/deals/${id}`,
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/deals/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  async listPipelines(_credentials: Credentials, _params: QueryParams): Promise<Pipeline[]> {
    throw notSupported(PIPELINES_REFUSAL)
  }

  async getPipeline(_credentials: Credentials, _id: string): Promise<Pipeline> {
    throw notSupported(PIPELINE_REFUSAL)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const items = await this.page<RawFolkNote>(credentials, '/v1/notes', params)
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.client(credentials).get<RawFolkNote>(
      `/v1/notes/${encodeURIComponent(id)}`,
    )
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).post<RawFolkNote>('/notes', untransformNote(data))
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/notes/${id}`)
  }
}
