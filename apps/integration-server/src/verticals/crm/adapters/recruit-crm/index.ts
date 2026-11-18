import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  reportUpstreamPage,
  simpleApiKey,
} from '@opensteward/shared'
/**
 * Recruit CRM adapter for the CRM vertical.
 *
 * Maps the Recruit CRM REST API to canonical CRM resources.
 * Docs: https://docs.recruitcrm.io/
 *
 * Auth: Bearer token
 * Base URL: https://api.recruitcrm.io/v1/
 * Notable:
 *   - ATS + CRM for recruitment agencies, India-founded, global
 *   - credentials.accessToken = API token
 *   - Paged lists take `page` + `limit` (max 100); the end is `next_page_url: null`
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (18):
 *   Contacts: list, get, create, update, delete
 *   Companies: list, get, create, update, delete
 *   Deals: list, get, create, update, delete
 *   Pipelines: list refuses (501): only one unnamed stage list is documented
 *   Activities: list, get (tasks, meetings and call logs), create
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

import { RecruitCrmClient } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { DEFAULT_PAGE_SIZE } from './constants'
import {
  transformContact,
  untransformContact,
  type RawRecruitCrmContact,
} from './transform/contact'
import {
  transformCompany,
  untransformCompany,
  type RawRecruitCrmCompany,
} from './transform/company'
import { transformDeal, untransformDeal, type RawRecruitCrmDeal } from './transform/deal'
import {
  transformActivity,
  untransformActivity,
  type RawRecruitCrmActivity,
} from './transform/activity'
import { transformTask, TASK_ID_PREFIX, type RawRecruitCrmTask } from './transform/task'
import { transformMeeting, MEETING_ID_PREFIX, type RawRecruitCrmMeeting } from './transform/meeting'
import {
  transformCallLog,
  CALL_LOG_ID_PREFIX,
  type RawRecruitCrmCallLog,
} from './transform/call-log'
import { transformNote, untransformNote, type RawRecruitCrmNote } from './transform/note'

export interface RecruitCrmAdapterConfig {
  apiKey?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()

/** "Limit of records per page. (Max:100)" on every documented list endpoint. */
const MAX_PAGE_SIZE = 100

/**
 * The three documented activity collections, streamed in this order as one
 * list. Each is a page/limit list with a `next_page_url` end signal:
 * GET /v1/tasks ("Show all tasks"), GET /v1/meetings ("Show all meetings")
 * and GET /v1/call-logs ("Show all Call Logs"). Each has its own id space, so
 * the canonical id carries the collection's prefix, and getActivity reads it
 * back from the matching find-by-ID endpoint.
 */
const ACTIVITY_SOURCES: readonly {
  path: string
  transform: (raw: unknown) => Activity
}[] = [
  { path: 'tasks', transform: (raw) => transformTask(raw as RawRecruitCrmTask) },
  { path: 'meetings', transform: (raw) => transformMeeting(raw as RawRecruitCrmMeeting) },
  { path: 'call-logs', transform: (raw) => transformCallLog(raw as RawRecruitCrmCallLog) },
]

interface ActivityCursor {
  /** Index into ACTIVITY_SOURCES. */
  source: number
  /** 1-based upstream page within that source. */
  page: number
}

export class RecruitCrmAdapter implements CrmAdapter {
  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'recruit-crm'
  readonly version = '0.1.0'

  constructor(_config: RecruitCrmAdapterConfig = {}) {}

  // ── Auth (API key — no OAuth flow) ────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return '#api-key-auth'
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

  private client(credentials: Credentials): RecruitCrmClient {
    return new RecruitCrmClient(credentials)
  }

  /**
   * One caller page of a documented paged list: `page` is forwarded as is and
   * `limit` clamped to the documented maximum. A clamped request pages at 100,
   * which is reported as `pageSize` so the caller strides by it.
   */
  private async pagedList<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
  ): Promise<T[]> {
    const requested = Math.floor(Number(params.limit ?? DEFAULT_PAGE_SIZE))
    const wanted = Number.isFinite(requested) ? requested : DEFAULT_PAGE_SIZE
    const size = Math.min(Math.max(wanted, 1), MAX_PAGE_SIZE)
    const rawPage = Number(params.page ?? 1)
    const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1
    const { items, hasMore } = await this.client(credentials).listPage<T>(path, page, size)
    reportUpstreamPage(params, { hasMore, pageSize: size })
    return items
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const items = await this.pagedList<RawRecruitCrmContact>(credentials, 'contacts', params)
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<RawRecruitCrmContact>(`contacts/${id}`)
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).post<RawRecruitCrmContact>('contacts', body)
    return transformContact(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).put<RawRecruitCrmContact>(`contacts/${id}`, body)
    return transformContact(res)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`contacts/${id}`)
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const items = await this.pagedList<RawRecruitCrmCompany>(credentials, 'companies', params)
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const res = await this.client(credentials).get<RawRecruitCrmCompany>(`companies/${id}`)
    return transformCompany(res)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).post<RawRecruitCrmCompany>('companies', body)
    return transformCompany(res)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).put<RawRecruitCrmCompany>(`companies/${id}`, body)
    return transformCompany(res)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`companies/${id}`)
  }

  // ── Deals ─────────────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const items = await this.pagedList<RawRecruitCrmDeal>(credentials, 'deals', params)
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const res = await this.client(credentials).get<RawRecruitCrmDeal>(`deals/${id}`)
    return transformDeal(res)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).post<RawRecruitCrmDeal>('deals', body)
    return transformDeal(res)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).put<RawRecruitCrmDeal>(`deals/${id}`, body)
    return transformDeal(res)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`deals/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  /**
   * Recruit CRM documents no list of pipelines. Its only deal-pipeline
   * endpoint, GET /v1/deals-pipeline ("Get Deals Stages"), "Returns a list of
   * stages in deals pipeline" with the fields id, label and percentage, and
   * gives the pipeline itself no id and no name, both of which a canonical
   * Pipeline requires.
   */
  async listPipelines(_credentials: Credentials, _params: QueryParams): Promise<Pipeline[]> {
    throw Object.assign(
      new Error(
        'Recruit CRM cannot list pipelines: its only deal pipeline endpoint, GET /v1/deals-pipeline, "Returns a list of stages in deals pipeline" (id, label, percentage) with no pipeline id or name',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  // ── Activities ────────────────────────────────────────────────────────────

  /**
   * Tasks, then meetings, then call logs, as one stream of activities. Each
   * collection is read at the documented maximum of 100 rows per request and
   * the caller's page is cut out of the stream by pageByRows, which reports
   * `hasMore` exactly. A collection ends where its `next_page_url` is null.
   */
  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const client = this.client(credentials)
    const key = cursorPagerKey(
      connectionScope('api.recruitcrm.io', credentials),
      'activities:tasks+meetings+call-logs',
      { limit: MAX_PAGE_SIZE },
    )
    const { items } = await pageByRows<Activity, ActivityCursor>(
      key,
      params,
      async (cursor) => {
        const at = cursor ?? { source: 0, page: 1 }
        const source = ACTIVITY_SOURCES[at.source]!
        const res = await client.listPage<unknown>(source.path, at.page, MAX_PAGE_SIZE)
        const next: ActivityCursor | undefined = res.hasMore
          ? { source: at.source, page: at.page + 1 }
          : at.source + 1 < ACTIVITY_SOURCES.length
            ? { source: at.source + 1, page: 1 }
            : undefined
        return { items: res.items.map((raw) => source.transform(raw)), next }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  /** Reads an id listActivities returned back from its collection's find-by-ID endpoint. */
  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const client = this.client(credentials)
    if (id.startsWith(TASK_ID_PREFIX)) {
      const raw = await client.get<RawRecruitCrmTask>(
        `tasks/${encodeURIComponent(id.slice(TASK_ID_PREFIX.length))}`,
      )
      return transformTask(raw)
    }
    if (id.startsWith(MEETING_ID_PREFIX)) {
      const raw = await client.get<RawRecruitCrmMeeting>(
        `meetings/${encodeURIComponent(id.slice(MEETING_ID_PREFIX.length))}`,
      )
      return transformMeeting(raw)
    }
    if (id.startsWith(CALL_LOG_ID_PREFIX)) {
      const raw = await client.get<RawRecruitCrmCallLog>(
        `call-logs/${encodeURIComponent(id.slice(CALL_LOG_ID_PREFIX.length))}`,
      )
      return transformCallLog(raw)
    }
    throw Object.assign(
      new Error(
        `Recruit CRM activity id "${id}" names no collection: expected a ${TASK_ID_PREFIX}, ${MEETING_ID_PREFIX} or ${CALL_LOG_ID_PREFIX} prefix`,
      ),
      { statusCode: 404, code: 'NOT_FOUND' },
    )
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const res = await this.client(credentials).post<RawRecruitCrmActivity>('activities', body)
    return transformActivity(res)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const items = await this.pagedList<RawRecruitCrmNote>(credentials, 'notes', params)
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const res = await this.client(credentials).get<RawRecruitCrmNote>(`notes/${id}`)
    return transformNote(res)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const res = await this.client(credentials).post<RawRecruitCrmNote>('notes', body)
    return transformNote(res)
  }
}
