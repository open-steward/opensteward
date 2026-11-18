/**
 * Freshsales adapter for the CRM vertical.
 *
 * Maps the Freshsales CRM REST API v2 to canonical CRM resources.
 * Docs: https://developers.freshworks.com/crm/api/
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (38):
 *   Contacts:   list*, get, create, update, delete
 *   Companies:  list*, get, create, update, delete
 *   Deals:      list*, get, create, update, delete
 *   Pipelines:  list, get
 *   Activities: list, get, create, update, delete  (mapped to Tasks)
 *   Notes:      list*, get, create, update, delete
 *
 *   * Refuses with 501 NOT_SUPPORTED before sending anything — see
 *     {@link notListable}.
 *   Auth:       getAuthUrl (N/A — API key), exchangeCode (N/A), refreshCredentials (N/A)
 *   Webhooks:   verifyWebhook (always true — no signing), parseWebhookEvents
 *
 * Omitted (0) — registry returns HTTP 501 automatically:
 *   (none — all interface methods implemented)
 */

import { pageLocally, reportUpstreamPage } from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { CREDENTIAL_FORM } from './auth'
import { FreshsalesClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyWebhook as _verifyWebhook, parseWebhookEvents as _parseWebhookEvents } from './webhook'
import {
  transformContact, untransformContact, type RawFreshsalesContact,
} from './transform/contact'
import {
  transformCompany, untransformCompany, type RawFreshsalesCompany,
} from './transform/company'
import {
  transformDeal, untransformDeal, type RawFreshsalesDeal,
} from './transform/deal'
import {
  transformPipeline, type RawFreshsalesPipeline,
} from './transform/pipeline'
import {
  transformActivity, untransformActivity, type RawFreshsalesTask,
} from './transform/activity'
import {
  transformNote, untransformNote, type RawFreshsalesNote,
} from './transform/note'

export interface FreshsalesAdapterConfig {
  /** Static API key. Stored as credentials.accessToken. */
  apiKey?: string
  /** Freshsales domain (e.g. "mycompany" → mycompany.myfreshworks.com). */
  domain?: string
}

/**
 * Largest `per_page` requested. Freshsales documents no ceiling for list
 * endpoints — only /search and /filtered_search state "you can’t have more than
 * 100 results displayed" — so 100 is the conventional reading, not a verified
 * limit. Declared so the sync worker's short-page test uses the same number.
 * {@link taskPage} checks every task page against `meta.total`, so a lower
 * ceiling enforced silently fails loudly instead of ending a walk early.
 */
const MAX_PAGE_SIZE = 100

/**
 * The refusal for a list Freshsales documents no way to serve, thrown before
 * any request. Contacts, accounts and deals list only through a view —
 * "To fetch contacts from a view, first fetch the view id using the filters
 * API and then use view API to fetch." — and nothing in a filter marks the view
 * of every record: `is_default` is true on seven of the docs' ten contact views
 * and all three account views, only the display name says "All Contacts", and
 * the docs' own "To fetch all contacts (view_id => 3 …)" names a view their
 * example lists as "New Contacts", and "To fetch all deals (view_id => 4 …)" one
 * listed as "Recent Deals". Notes have no list at all.
 * (https://developers.freshworks.com/crm/api/)
 */
function notListable(resource: string, reason: string): Error {
  return Object.assign(new Error(`Freshsales cannot list ${resource}: ${reason}`), {
    statusCode: 501,
    code: 'NOT_SUPPORTED',
  })
}

/** Why contacts, accounts and deals cannot be listed; see {@link notListable}. */
function viewOnly(resource: string, path: string): Error {
  return notListable(
    resource,
    `Freshsales lists them only through a view (GET /api/${path}/view/[view_id]: "first fetch the ` +
      'view id using the filters API and then use view API to fetch"), and no documented filter ' +
      `field identifies the view of all ${resource}.`,
  )
}

type TaskFilter = 'open' | 'completed'

/**
 * One page of one task filter, refused when it cannot be what `per_page`
 * asked for: more rows than asked, or fewer while `meta.total` says more
 * exist. Either means Freshsales is paging by a size other than the one sent,
 * so the next page would start in the wrong place.
 */
async function taskPage(
  client: FreshsalesClient,
  filter: TaskFilter,
  page: number,
  size: number,
): Promise<{ items: RawFreshsalesTask[]; total: number | undefined }> {
  const res = await client.listTasks<RawFreshsalesTask>(filter, page, size)
  const served = (page - 1) * size + res.items.length
  const short = res.items.length < size && res.total !== undefined && served < res.total
  if (res.items.length > size || short) {
    throw Object.assign(
      new Error(
        `Freshsales GET /tasks?filter=${filter} returned ${res.items.length} tasks for page ` +
          `${page} at per_page=${size} (meta.total ${res.total ?? 'absent'}): it is not paging ` +
          `by the size sent. MAX_PAGE_SIZE (${MAX_PAGE_SIZE}) is not a documented limit here.`,
      ),
      { statusCode: 502, code: 'UPSTREAM_ERROR' },
    )
  }
  return res
}


export class FreshsalesAdapter implements CrmAdapter {

  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  // Connect Link support — per-customer form (see ./auth.ts).

  credentialFields = CREDENTIAL_FORM.credentialFields

  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  readonly platform = 'freshsales'
  readonly version = '0.1.0'

  private staticApiKey: string | undefined
  private staticDomain: string | undefined

  constructor(config: FreshsalesAdapterConfig = {}) {
    this.staticApiKey = config.apiKey
    this.staticDomain = config.domain
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Freshsales uses API key auth — no OAuth URL
    return '#freshsales-api-key'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return {
      accessToken: this.staticApiKey ?? '',
      extra: { domain: this.staticDomain ?? '' },
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

  private client(credentials: Credentials): FreshsalesClient {
    // A deployment-level static key/domain wins when configured; otherwise the
    // connection's own domain and API base (set by the Connect Link form) are used.
    const effective: Credentials = this.staticApiKey
      ? {
          accessToken: this.staticApiKey,
          extra: this.staticDomain ? { domain: this.staticDomain } : credentials.extra,
        }
      : credentials
    return new FreshsalesClient(effective)
  }

  /**
   * `page` ("The page number starts with 1.") + `per_page`, a whole number in
   * 1..MAX_PAGE_SIZE. A page missing, below 1 or not a number is page 1; a
   * limit that is not a number of at least 1 is the adapter default.
   */
  private listPage(params: QueryParams): [page: number, perPage: number] {
    const p = Number(params.page)
    const l = Number(params.limit)
    return [
      Number.isFinite(p) && p >= 1 ? Math.floor(p) : 1,
      Number.isFinite(l) && l >= 1 ? Math.min(Math.floor(l), MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE,
    ]
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(_credentials: Credentials, _params: QueryParams): Promise<Contact[]> {
    throw viewOnly('contacts', 'contacts')
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawFreshsalesContact>(`/contacts/${id}`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).post<RawFreshsalesContact>(
      '/contacts',
      'contact',
      { contact: untransformContact(data) },
    )
    return transformContact(raw)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).put<RawFreshsalesContact>(
      `/contacts/${id}`,
      'contact',
      { contact: untransformContact(data) },
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contacts/${id}`)
  }

  // ── Companies (Sales Accounts) ─────────────────────────────────────────────

  async listCompanies(_credentials: Credentials, _params: QueryParams): Promise<Company[]> {
    throw viewOnly('accounts', 'sales_accounts')
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawFreshsalesCompany>(`/sales_accounts/${id}`)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).post<RawFreshsalesCompany>(
      '/sales_accounts',
      'sales_account',
      { sales_account: untransformCompany(data) },
    )
    return transformCompany(raw)
  }

  async updateCompany(credentials: Credentials, id: string, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).put<RawFreshsalesCompany>(
      `/sales_accounts/${id}`,
      'sales_account',
      { sales_account: untransformCompany(data) },
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/sales_accounts/${id}`)
  }

  // ── Deals ─────────────────────────────────────────────────────────────────

  async listDeals(_credentials: Credentials, _params: QueryParams): Promise<Deal[]> {
    throw viewOnly('deals', 'deals')
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawFreshsalesDeal>(`/deals/${id}`)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).post<RawFreshsalesDeal>(
      '/deals',
      'deal',
      { deal: untransformDeal(data) },
    )
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).put<RawFreshsalesDeal>(
      `/deals/${id}`,
      'deal',
      { deal: untransformDeal(data) },
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/deals/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  /**
   * The documented pipeline list is a configuration selector — "api/selector/deal_pipelines
   * Fetch all existing deal pipelines' details in the Freshsales portal." — with
   * no paging (the "Pagination" section covers the view lists), so it is read
   * whole and nothing is sent: a `per_page` of our own would be a fixed size.
   */
  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    // `get` unwraps the response's one key (`deal_pipelines`).
    const items = await this.client(credentials).get<RawFreshsalesPipeline[]>(
      '/selector/deal_pipelines',
    )
    // Paged locally, so a caller limit below the pipeline count still reaches
    // each one: the adapter declares maxPageSize 100.
    return pageLocally((Array.isArray(items) ? items : []).map(transformPipeline), params)
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const raw = await this.client(credentials).get<RawFreshsalesPipeline>(`/deal_pipelines/${id}`)
    return transformPipeline(raw)
  }

  // ── Activities (Tasks) ────────────────────────────────────────────────────

  /**
   * Freshsales lists tasks only through a filter — "The parameter filter is
   * mandatory." and "Only one filter is allowed at a time." — and a task's
   * status is Open or Completed, so the collection is the `open` list followed
   * by the `completed` list. Page k is rows [(k − 1)·size, k·size) of that
   * sequence: page k of `open`, topped up from `completed` once `open` runs
   * out, so every page but the last is full.
   */
  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const [page, size] = this.listPage(params)
    const client = this.client(credentials)
    const start = (page - 1) * size
    const open = await taskPage(client, 'open', page, size)
    const rows = [...open.items]
    let hasMore = open.total !== undefined && start + size < open.total ? true : undefined
    if (rows.length < size) {
      // `open` ends inside this page. Its short page says where, unless that
      // page is empty and not the first: then only its total can.
      const openTotal = rows.length > 0 || page === 1 ? start + rows.length : open.total
      if (openTotal === undefined) {
        throw Object.assign(
          new Error(
            `Freshsales GET /tasks?filter=open returned an empty page ${page} without meta.total, ` +
              'so where the open tasks end — and the completed ones begin — is unknown.',
          ),
          { statusCode: 502, code: 'UPSTREAM_ERROR' },
        )
      }
      // Rows [from, to) of `completed` finish this page.
      const from = Math.max(0, start - openTotal)
      const to = start + size - openTotal
      for (let p = Math.floor(from / size) + 1; (p - 1) * size < to; p++) {
        const at = (p - 1) * size
        const done = await taskPage(client, 'completed', p, size)
        rows.push(...done.items.slice(Math.max(0, from - at), to - at))
        const doneTotal = done.items.length < size ? at + done.items.length : done.total
        if (doneTotal !== undefined) hasMore = start + rows.length < openTotal + doneTotal
        if (done.items.length < size) break
      }
    }
    if (hasMore !== undefined) reportUpstreamPage(params, { hasMore })
    return rows.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).get<RawFreshsalesTask>(`/tasks/${id}`)
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const raw = await this.client(credentials).post<RawFreshsalesTask>(
      '/tasks',
      'task',
      { task: untransformActivity(data) },
    )
    return transformActivity(raw)
  }

  async updateActivity(credentials: Credentials, id: string, data: Partial<Activity>): Promise<Activity> {
    const raw = await this.client(credentials).put<RawFreshsalesTask>(
      `/tasks/${id}`,
      'task',
      { task: untransformActivity(data) },
    )
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/tasks/${id}`)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(_credentials: Credentials, _params: QueryParams): Promise<Note[]> {
    throw notListable(
      'notes',
      'its Notes API documents only "Create a Note", "Update a note" and "Delete a note"; notes ' +
        'come back only inside one record ("api/contacts/[id]?include=notes").',
    )
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.client(credentials).get<RawFreshsalesNote>(`/notes/${id}`)
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).post<RawFreshsalesNote>(
      '/notes',
      'note',
      { note: untransformNote(data) },
    )
    return transformNote(raw)
  }

  async updateNote(credentials: Credentials, id: string, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).put<RawFreshsalesNote>(
      `/notes/${id}`,
      'note',
      { note: untransformNote(data) },
    )
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/notes/${id}`)
  }
}
