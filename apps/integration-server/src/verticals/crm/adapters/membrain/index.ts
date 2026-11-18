import {
  connectionScope,
  customForm,
  cursorPagerKey,
  pageByRows,
  pageLocally,
  type CredentialField,
} from '@opensteward/shared'
/**
 * Membrain adapter for the CRM vertical.
 *
 * Maps the Membrain REST API v2 to canonical CRM resources.
 * Docs: https://www.membrain.com/developers/api-documentation
 *
 * Host: "https://*.membrain.com/API/v2/", where `*` is the customer's own
 * instance (credentials.extra.subdomain).
 * Auth: "you may instead pass the APIKey in a Request Header named APIKey".
 * Paging: "?From=N" row offsets over pages of 100 ("default is 100 per page";
 * no page-size parameter is documented), ending "When to matches count".
 *
 * Reads:
 *   Contacts:   GET /contacts/, GET /contacts/{Id}
 *   Companies:  GET /companies/, GET /companies/{Id}
 *   Deals:      GET /opportunities/, GET /opportunities/{Id}
 *   Pipelines:  GET /salesProcesses/ (a bare array, unpaged; no by-id path)
 *   Activities: GET /activities/, GET /activities/{Id}
 *   Notes:      GET /activities/?Type=Note, GET /activities/{Id} (Type "Note")
 *
 * The create/update/delete methods predate this rebuild and still send the
 * pre-rebuild paths and bodies; they are not verified against the docs.
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { MembrainClient, offContract } from './client'
import { UPSTREAM_PAGE_SIZE } from './constants'
import {
  verifyWebhook as _verifyWebhook,
  parseWebhookEvents as _parseWebhookEvents,
} from './webhook'
import { transformContact, untransformContact, type RawMembrainContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawMembrainCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawMembrainDeal } from './transform/deal'
import { transformPipeline, type RawMembrainPipeline } from './transform/pipeline'
import {
  transformActivity,
  untransformActivity,
  type RawMembrainActivity,
} from './transform/activity'
import { transformNote, untransformNote, type RawMembrainNote } from './transform/note'

export interface MembrainAdapterConfig {
  apiKey?: string
}

const MEMBRAIN_CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'apiKey',
    label: 'API key',
    type: 'password',
    required: true,
  },
  {
    name: 'subdomain',
    label: 'Membrain instance',
    type: 'text',
    required: true,
    placeholder: 'yourcompany',
    helpText: 'The part before .membrain.com in your Membrain address.',
  },
]

const MEMBRAIN_FORM = customForm({
  fields: MEMBRAIN_CREDENTIAL_FIELDS,
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const apiKey = (fields['apiKey'] ?? '').trim()
    const subdomain = (fields['subdomain'] ?? '').trim()
    if (!apiKey) throw new Error('API key is required.')
    if (!subdomain) throw new Error('Membrain instance is required.')
    return { accessToken: apiKey, extra: { subdomain } }
  },
})

/**
 * Oldest first. "You can optionally request a specific sort order, the
 * following options are available 'CreatedDate ASC', 'CreatedDate DESC',
 * 'ChangedDate ASC', 'ChangedDate DESC'" (GET /contacts/, /companies/,
 * /activities/). The defaults ("sorted by Name ASC", "sorted by Date DESC")
 * shift every later `From` offset when a row is added mid-walk; with
 * 'CreatedDate ASC' a new row lands at the end. GET /opportunities/ documents
 * no SortBy, so deals keep the server's order.
 */
const OLDEST_FIRST = { SortBy: 'CreatedDate ASC' }

function notFound(what: string, id: string): Error {
  return Object.assign(new Error(`Membrain ${what} ${id} not found`), { statusCode: 404 })
}

export class MembrainAdapter implements CrmAdapter {
  // Connect Link support — API key plus the instance subdomain.

  credentialFields = MEMBRAIN_FORM.credentialFields

  exchangeCredentials = MEMBRAIN_FORM.exchangeCredentials

  readonly platform = 'membrain'
  readonly version = '0.2.0'

  constructor(_config: MembrainAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return '#api-key-auth'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('Membrain: use API key auth — set accessToken directly')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
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

  private c(creds: Credentials): MembrainClient {
    return new MembrainClient(creds)
  }

  /**
   * The caller's page of a documented paged collection. Upstream pages are
   * 100 rows from `From`; the next one starts at `to` until `to` reaches
   * `count`, and `pageByRows` cuts the caller's rows out of them.
   */
  private async pageRows<R>(
    credentials: Credentials,
    path: string,
    filters: Record<string, string>,
    params: QueryParams,
  ): Promise<R[]> {
    const client = this.c(credentials)
    const key = cursorPagerKey(connectionScope(client.host, credentials), path, {
      ...filters,
      upstreamPageSize: UPSTREAM_PAGE_SIZE,
    })
    const { items } = await pageByRows<R, number>(key, params, async (from) => {
      const page = await client.page<R>(path, { ...filters, From: from ?? 0 })
      return { items: page.items, next: page.to < page.count ? page.to : undefined }
    })
    return items
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const rows = await this.pageRows<RawMembrainContact>(
      credentials,
      '/contacts/',
      // "Set IncludeRetired to \"true\" in order for the search to include
      // Contacts that are marked with \"Left Company\" / \"Retired\"": getContact
      // reads those too, so the list includes them.
      { IncludeRetired: 'true', ...OLDEST_FIRST },
      params,
    )
    return rows.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.c(credentials).get<RawMembrainContact>(
      `/contacts/${encodeURIComponent(id)}`,
    )
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.c(credentials).post<RawMembrainContact>(
      '/persons',
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const raw = await this.c(credentials).put<RawMembrainContact>(
      `/persons/${id}`,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/persons/${id}`)
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const rows = await this.pageRows<RawMembrainCompany>(
      credentials,
      '/companies/',
      OLDEST_FIRST,
      params,
    )
    return rows.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.c(credentials).get<RawMembrainCompany>(
      `/companies/${encodeURIComponent(id)}`,
    )
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.c(credentials).post<RawMembrainCompany>(
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
    const raw = await this.c(credentials).put<RawMembrainCompany>(
      `/companies/${id}`,
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/companies/${id}`)
  }

  // ── Deals (Opportunities / Sales Projects) ─────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const rows = await this.pageRows<RawMembrainDeal>(credentials, '/opportunities/', {}, params)
    return rows.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.c(credentials).get<RawMembrainDeal>(
      `/opportunities/${encodeURIComponent(id)}`,
    )
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.c(credentials).post<RawMembrainDeal>('/deals', untransformDeal(data))
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.c(credentials).put<RawMembrainDeal>(
      `/deals/${id}`,
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/deals/${id}`)
  }

  // ── Pipelines (Sales Processes) ───────────────────────────────────────────

  /**
   * GET /salesProcesses/: "Fetches description of all currently active sales
   * processes and includes stages, steps and custom fields." Its example
   * result is a bare array, not a paged collection, so it is sliced locally.
   * A body that is not an array throws (502) rather than reading as no
   * processes, which would tell a sync the collection is empty.
   */
  private async salesProcesses(credentials: Credentials): Promise<Pipeline[]> {
    const raw = await this.c(credentials).get<unknown>('/salesProcesses/')
    if (!Array.isArray(raw)) throw offContract('/salesProcesses/', 'an array of sales processes')
    return (raw as RawMembrainPipeline[]).map(transformPipeline)
  }

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    return pageLocally(await this.salesProcesses(credentials), params)
  }

  /** The docs have no GET /salesProcesses/{Id}; the id is found in the full list. */
  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const found = (await this.salesProcesses(credentials)).find((p) => p.id === id)
    if (!found) throw notFound('sales process', id)
    return found
  }

  // ── Activities ────────────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const rows = await this.pageRows<RawMembrainActivity>(
      credentials,
      '/activities/',
      OLDEST_FIRST,
      params,
    )
    return rows.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.c(credentials).get<RawMembrainActivity>(
      `/activities/${encodeURIComponent(id)}`,
    )
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const raw = await this.c(credentials).post<RawMembrainActivity>(
      '/activities',
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const raw = await this.c(credentials).put<RawMembrainActivity>(
      `/activities/${id}`,
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/activities/${id}`)
  }

  // ── Notes (Activities of Type "Note") ──────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const rows = await this.pageRows<RawMembrainNote>(
      credentials,
      '/activities/',
      { Type: 'Note', ...OLDEST_FIRST },
      params,
    )
    return rows.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.c(credentials).get<RawMembrainNote>(
      `/activities/${encodeURIComponent(id)}`,
    )
    if (raw?.Type !== 'Note') throw notFound('note', id)
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.c(credentials).post<RawMembrainNote>('/notes', untransformNote(data))
    return transformNote(raw)
  }

  async updateNote(credentials: Credentials, id: string, data: Partial<Note>): Promise<Note> {
    const raw = await this.c(credentials).put<RawMembrainNote>(
      `/notes/${id}`,
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/notes/${id}`)
  }
}
