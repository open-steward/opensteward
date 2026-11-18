import { pageLocally, pageOffset, reportUpstreamPage, simpleApiKey } from '@opensteward/shared'
/**
 * Crelate adapter for the CRM vertical.
 *
 * Reads use Crelate API v3; its OpenAPI document is
 * https://app.crelate.com/api3/docs/v3/crelate-openapi.json. Public API v1,
 * which this adapter used to call, now answers every path with HTTP 410
 * ("As previously announced for over 2 years, Public API v1 and v2 has been
 * disabled."). The write methods below still target v1 and are out of scope
 * of the read rebuild (see constants.ts).
 *
 * ── Auth ─────────────────────────────────────────────────────────────────
 *   Reads: the `X-Api-Key` header. credentials.accessToken = API key.
 *
 * ── Paging ───────────────────────────────────────────────────────────────
 *   "All retrieve endpoints that return a list of records support pagination
 *   through querystring parameters": `offset` ("Number of records to offset
 *   the retrieve by.") and `limit` (default 50, "(Maximum of 100)"). The end
 *   of a list is `Metadata.MoreRecords`.
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (14):
 *   Contacts:   list, get, create, update, delete
 *   Companies:  list, get, create, update, delete
 *   Deals:      list, get, create, update, delete  (Crelate "Jobs")
 *   Pipelines:  list                               (Crelate workflow types)
 *   Notes:      createNote (contact-scoped)
 *   Activities: createActivity (contact-scoped task)
 *
 * Omitted — registry returns HTTP 501 automatically:
 *   getNote, updateNote, deleteNote (require parent-entity context not in
 *   interface signature), getActivity / updateActivity / deleteActivity (same).
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Note } from '../../schema/note'
import type { Activity } from '../../schema/activity'
import type { WebhookEvent } from '../../schema/webhook'

import { CrelateClient } from './client'
import { DEFAULT_PAGE_SIZE, LIST_SORT, MAX_PAGE_SIZE, WORKFLOW_TYPES } from './constants'
import {
  verifyWebhook as _verifyWebhook,
  parseWebhookEvents as _parseWebhookEvents,
} from './webhook'
import { transformContact, untransformContact, type RawCrelateContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawCrelateCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawCrelateJob } from './transform/deal'
import { untransformNote } from './transform/note'
import { transformActivity, untransformActivity, type RawCrelateTask } from './transform/activity'
import { transformPipeline, type RawCrelateWorkflowStatus } from './transform/pipeline'

const SIMPLE_API_KEY_FORM = simpleApiKey()

export class CrelateAdapter implements CrmAdapter {
  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'crelate'
  readonly version = '0.1.0'

  /** Documented: "(Maximum of 100)". */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Crelate uses API key auth, not OAuth2.
    return ''
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // Caller passes the Crelate API key as `code`.
    return { accessToken: code }
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

  private client(credentials: Credentials): CrelateClient {
    return new CrelateClient(credentials)
  }

  /**
   * The caller's page of a v3 list endpoint: 1-based `page` → `offset`, the
   * caller's `limit` clamped to 1..100, the documented default sort made
   * explicit, and `updatedAfter` as `modified_after` ("... that have been
   * modified after this date.").
   */
  private async listPage<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
  ): Promise<T[]> {
    const asked = Number(params.limit)
    const size =
      Number.isFinite(asked) && asked >= 1
        ? Math.min(Math.floor(asked), MAX_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE
    const query: Record<string, string> = {
      limit: String(size),
      offset: String(pageOffset(params, size)),
      sort_by: LIST_SORT,
    }
    if (params.updatedAfter instanceof Date)
      query.modified_after = params.updatedAfter.toISOString()
    const { items, metadata } = await this.client(credentials).list<T>(path, query)
    reportUpstreamPage(params, {
      ...(typeof metadata.MoreRecords === 'boolean' ? { hasMore: metadata.MoreRecords } : {}),
      ...(Number.isFinite(asked) && size < asked ? { pageSize: size } : {}),
    })
    return items
  }

  /** Every workflow status of one workflow type, walked to `MoreRecords: false`. */
  private async workflowStatuses(
    credentials: Credentials,
    workflowTypeId: string,
  ): Promise<RawCrelateWorkflowStatus[]> {
    const client = this.client(credentials)
    const out: RawCrelateWorkflowStatus[] = []
    for (let offset = 0; ; offset += MAX_PAGE_SIZE) {
      const { items, metadata } = await client.list<RawCrelateWorkflowStatus>('/workflowstatuses', {
        workflow_type_ids: workflowTypeId,
        limit: String(MAX_PAGE_SIZE),
        offset: String(offset),
        sort_by: LIST_SORT,
      })
      out.push(...items)
      if (metadata.MoreRecords !== true || items.length === 0) return out
    }
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const items = await this.listPage<RawCrelateContact>(credentials, '/contacts', params)
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawCrelateContact>(`/contacts/${id}`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).post<{ Id?: string; id?: string }>('/contacts', body)
    const newId = res.Id ?? res.id
    if (!newId) {
      throw new Error('Crelate: contact creation returned no ID')
    }
    return this.getContact(credentials, newId)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const body = untransformContact(data)
    await this.client(credentials).put<unknown>(`/contacts/${id}`, body)
    return this.getContact(credentials, id)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contacts/${id}`)
  }

  // ── Companies ─────────────────────────────────────────────────────────────
  // Crelate calls companies "Accounts".

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const items = await this.listPage<RawCrelateCompany>(credentials, '/companies', params)
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawCrelateCompany>(`/companies/${id}`)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).post<{ Id?: string; id?: string }>(
      '/companies',
      body,
    )
    const newId = res.Id ?? res.id
    if (!newId) {
      throw new Error('Crelate: company creation returned no ID')
    }
    return this.getCompany(credentials, newId)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const body = untransformCompany(data)
    await this.client(credentials).put<unknown>(`/companies/${id}`, body)
    return this.getCompany(credentials, id)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/companies/${id}`)
  }

  // ── Deals (Jobs) ──────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const items = await this.listPage<RawCrelateJob>(credentials, '/jobs', params)
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawCrelateJob>(`/jobs/${id}`)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).post<{ Id?: string; id?: string }>('/jobs', body)
    const newId = res.Id ?? res.id
    if (!newId) {
      throw new Error('Crelate: deal (job) creation returned no ID')
    }
    return this.getDeal(credentials, newId)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    await this.client(credentials).put<unknown>(`/jobs/${id}`, body)
    return this.getDeal(credentials, id)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/jobs/${id}`)
  }

  // ── Pipelines (workflow types — read-only) ────────────────────────────────

  /**
   * One pipeline per Crelate workflow type. v3 has no workflow-type list
   * endpoint; the complete, fixed set is documented in GET /workflowstatuses'
   * `workflow_type_ids` parameter ("Possible values are: ..."), so the page is
   * cut locally from it. Each pipeline on the page gets its stages from GET
   * /workflowstatuses?workflow_type_ids=<id>.
   */
  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const page = pageLocally(WORKFLOW_TYPES, params)
    const out: Pipeline[] = []
    for (const type of page) {
      out.push(transformPipeline(type, await this.workflowStatuses(credentials, type.Id)))
    }
    return out
  }

  // ── Notes (contact-scoped) ────────────────────────────────────────────────

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const contactId = data.contact_id ?? data.company_id ?? data.deal_id
    if (!contactId) {
      throw new Error('Crelate: createNote requires contact_id, company_id, or deal_id')
    }
    const body = untransformNote(data)
    let parentPath: string
    if (data.contact_id) {
      parentPath = `/contacts/${data.contact_id}/notes`
    } else if (data.company_id) {
      parentPath = `/companies/${data.company_id}/notes`
    } else {
      parentPath = `/jobs/${data.deal_id}/notes`
    }
    const res = await this.client(credentials).post<{ Id?: string; id?: string }>(parentPath, body)
    const newId = res.Id ?? res.id
    if (!newId) {
      throw new Error('Crelate: note creation returned no ID')
    }
    // Crelate GET note requires parent context; return a minimal canonical Note
    return {
      id: newId,
      content: data.content ?? '',
      contact_id: data.contact_id,
      company_id: data.company_id,
      deal_id: data.deal_id,
      owner_id: undefined,
      metadata: { id: newId, body: data.content, ...body } as Record<string, unknown>,
    }
  }

  // ── Activities / Tasks (contact-scoped) ───────────────────────────────────

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const parentId = data.contact_id ?? data.company_id ?? data.deal_id
    if (!parentId) {
      throw new Error('Crelate: createActivity requires contact_id, company_id, or deal_id')
    }
    const body = untransformActivity(data)
    let parentPath: string
    if (data.contact_id) {
      parentPath = `/contacts/${data.contact_id}/tasks`
    } else if (data.company_id) {
      parentPath = `/companies/${data.company_id}/tasks`
    } else {
      parentPath = `/jobs/${data.deal_id}/tasks`
    }
    const res = await this.client(credentials).post<{ Id?: string; id?: string }>(parentPath, body)
    const newId = res.Id ?? res.id
    if (!newId) {
      throw new Error('Crelate: activity (task) creation returned no ID')
    }
    // Return minimal canonical Activity
    const minimalRaw: RawCrelateTask = {
      id: newId,
      body: body['body'] as string | undefined,
      due_date: body['due_date'] as string | undefined,
    }
    return transformActivity(minimalRaw)
  }
}
