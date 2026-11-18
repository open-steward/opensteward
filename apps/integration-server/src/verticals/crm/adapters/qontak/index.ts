/**
 * Qontak CRM adapter for the CRM vertical.
 *
 * Source for every read below: Qontak's own CRM OpenAPI,
 *   https://raw.githubusercontent.com/qontak-dev/docs/master/Qontak-CRM-OpenAPI-MAG.json
 * (the qontak-dev/docs repository behind docs.qontak.com). Host
 * https://api.mekari.com, paths under /qontak/crm/*, Mekari HMAC signing
 * (client.ts, auth.ts). The adapter's earlier host, service-ruby.qontak.com,
 * does not resolve, and its /api/open_api/v1/* paths appear nowhere in the docs.
 *
 * ── Reads ─────────────────────────────────────────────────────────────────
 *
 *   Contacts    GET /qontak/crm/contacts, /contacts/{id}
 *   Companies   GET /qontak/crm/companies, /companies/{id}
 *   Deals       GET /qontak/crm/deals?page&per_page, /deals/{id}
 *   Pipelines   GET /qontak/crm/pipelines, /pipelines/{id}
 *   Activities  GET /qontak/crm/tasks, /tasks/{id} (the API has no activities)
 *   Notes       GET /qontak/crm/notes, /notes/{id}
 *
 * Only the deals list documents paging parameters (`page`, "Page number for
 * pagination"; `per_page`, "Number of items per page"), so only it pages
 * upstream. The other lists document no page parameter at all, and are
 * described as returning everything ("Get All Contacts … You can get all
 * contacts just use endpoint"). They are fetched once and cut locally, but
 * only while the response's own `total_page` says that one response is the
 * whole collection: a response reporting more than one page is refused,
 * since the rows past page 1 are unreachable and a local cut would tell the
 * sync the collection is complete.
 *
 * ── Writes ────────────────────────────────────────────────────────────────
 *
 * The create/update/delete methods are unchanged from the earlier skeleton
 * and still call undocumented /api/open_api/v1/* paths (now on the
 * documented host, with HMAC). They are outside this rebuild.
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { pageLocally, reportUpstreamPage } from '@opensteward/shared'
import { QontakClient } from './client'
import { QONTAK_HMAC_FORM } from './auth'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { CRM_PATH, DEFAULT_PAGE_SIZE } from './constants'
import { transformContact, untransformContact, type RawQontakContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawQontakCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawQontakDeal } from './transform/deal'
import { transformPipeline, type RawQontakPipeline } from './transform/pipeline'
import {
  transformActivity,
  untransformActivity,
  type RawQontakActivity,
} from './transform/activity'
import { transformNote, untransformNote, type RawQontakNote } from './transform/note'

/**
 * The documented list envelope: `meta`, the rows under `response`, and on
 * most lists `"page": 1, "total_page": 1, "current_data": 2, "total_data": 2`.
 */
interface QontakListEnvelope<T> {
  response?: T[]
  page?: number
  total_page?: number
  total_data?: number
}

/** The documented single-record envelope: the record under `response`. */
interface QontakRecordEnvelope<T> {
  response?: T | T[]
}

function positiveInt(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback
}

export class QontakAdapter implements CrmAdapter {
  readonly platform = 'qontak'
  readonly version = '0.2.0'

  // ── Auth ───────────────────────────────────────────────────────────────────
  // HMAC credentials are entered directly; there is no OAuth step.

  credentialFields = QONTAK_HMAC_FORM.credentialFields
  exchangeCredentials = QONTAK_HMAC_FORM.exchangeCredentials

  getAuthUrl(_state: string): string {
    // Qontak's CRM API authenticates with Mekari HMAC signatures, not OAuth2.
    return ''
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return { accessToken: code }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // HMAC credentials do not expire.
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

  private client(credentials: Credentials): QontakClient {
    return new QontakClient(credentials)
  }

  /**
   * A list the docs describe as returning everything and give no page
   * parameter: fetch it once, refuse it when the response itself reports
   * more than one page, and cut the caller's page locally.
   */
  private async listWhole<R, T>(
    credentials: Credentials,
    params: QueryParams,
    resource: string,
    transform: (raw: R) => T,
  ): Promise<T[]> {
    const path = `${CRM_PATH}/${resource}`
    const res = await this.client(credentials).get<QontakListEnvelope<R>>(path)
    const rows = res?.response
    if (!Array.isArray(rows)) {
      throw Object.assign(new Error(`Qontak GET ${path} returned no \`response\` array`), {
        statusCode: 502,
      })
    }
    if (typeof res.total_page === 'number' && res.total_page > 1) {
      throw Object.assign(
        new Error(
          `Qontak cannot list ${resource} past its first page: GET ${path} reported ` +
            `total_page ${res.total_page}, and Qontak documents no page parameter for it.`,
        ),
        { statusCode: 501, code: 'NOT_SUPPORTED' },
      )
    }
    return pageLocally(rows.map(transform), params)
  }

  /**
   * One record by id. Most documented examples put the record itself under
   * `response`; the contacts and pipelines examples put an array there, so
   * the record with the asked-for id is taken from it.
   */
  private async getOne<R extends { id: number | string }, T>(
    credentials: Credentials,
    resource: string,
    id: string,
    transform: (raw: R) => T,
  ): Promise<T> {
    const path = `${CRM_PATH}/${resource}/${encodeURIComponent(id)}`
    const res = await this.client(credentials).get<QontakRecordEnvelope<R>>(path)
    const body = res?.response
    const record = Array.isArray(body) ? body.find((r) => String(r?.id) === id) : body
    if (!record) {
      throw Object.assign(new Error(`Qontak ${resource} ${id} not found`), { statusCode: 404 })
    }
    return transform(record)
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    return this.listWhole<RawQontakContact, Contact>(
      credentials,
      params,
      'contacts',
      transformContact,
    )
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    return this.getOne<RawQontakContact, Contact>(credentials, 'contacts', id, transformContact)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    // TODO: verify endpoint path
    const res = await this.client(credentials).post<{ data: RawQontakContact }>(
      '/api/open_api/v1/contacts',
      body,
    )
    return transformContact(res.data ?? (res as unknown as RawQontakContact))
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const body = untransformContact(data)
    // TODO: verify endpoint path
    const res = await this.client(credentials).put<{ data: RawQontakContact }>(
      `/api/open_api/v1/contacts/${id}`,
      body,
    )
    return transformContact(res.data ?? (res as unknown as RawQontakContact))
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    // TODO: verify endpoint path
    await this.client(credentials).delete(`/api/open_api/v1/contacts/${id}`)
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    return this.listWhole<RawQontakCompany, Company>(
      credentials,
      params,
      'companies',
      transformCompany,
    )
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    return this.getOne<RawQontakCompany, Company>(credentials, 'companies', id, transformCompany)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    // TODO: verify endpoint path
    const res = await this.client(credentials).post<{ data: RawQontakCompany }>(
      '/api/open_api/v1/organizations',
      body,
    )
    return transformCompany(res.data ?? (res as unknown as RawQontakCompany))
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const body = untransformCompany(data)
    // TODO: verify endpoint path
    const res = await this.client(credentials).put<{ data: RawQontakCompany }>(
      `/api/open_api/v1/organizations/${id}`,
      body,
    )
    return transformCompany(res.data ?? (res as unknown as RawQontakCompany))
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    // TODO: verify endpoint path
    await this.client(credentials).delete(`/api/open_api/v1/organizations/${id}`)
  }

  // ── Deals ─────────────────────────────────────────────────────────────────

  /**
   * GET /qontak/crm/deals documents `page` ("Page number for pagination")
   * and `per_page` ("Number of items per page", no maximum given), and its
   * response reports `page`, `total_page` and `total_data`.
   */
  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const page = positiveInt(params.page, 1)
    const perPage = positiveInt(params.limit, DEFAULT_PAGE_SIZE)
    const path = `${CRM_PATH}/deals`
    const res = await this.client(credentials).get<QontakListEnvelope<RawQontakDeal>>(path, {
      page,
      per_page: perPage,
    })
    const rows = res?.response
    if (!Array.isArray(rows)) {
      throw Object.assign(new Error(`Qontak GET ${path} returned no \`response\` array`), {
        statusCode: 502,
      })
    }
    const totalPages = typeof res.total_page === 'number' ? res.total_page : undefined
    reportUpstreamPage(params, {
      totalCount: typeof res.total_data === 'number' ? res.total_data : undefined,
      totalPages,
      currentPage: page,
      hasMore: totalPages !== undefined ? page < totalPages : undefined,
    })
    return rows.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    return this.getOne<RawQontakDeal, Deal>(credentials, 'deals', id, transformDeal)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    // TODO: verify endpoint path
    const res = await this.client(credentials).post<{ data: RawQontakDeal }>(
      '/api/open_api/v1/deals',
      body,
    )
    return transformDeal(res.data ?? (res as unknown as RawQontakDeal))
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    // TODO: verify endpoint path
    const res = await this.client(credentials).put<{ data: RawQontakDeal }>(
      `/api/open_api/v1/deals/${id}`,
      body,
    )
    return transformDeal(res.data ?? (res as unknown as RawQontakDeal))
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    // TODO: verify endpoint path
    await this.client(credentials).delete(`/api/open_api/v1/deals/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    return this.listWhole<RawQontakPipeline, Pipeline>(
      credentials,
      params,
      'pipelines',
      transformPipeline,
    )
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    return this.getOne<RawQontakPipeline, Pipeline>(credentials, 'pipelines', id, transformPipeline)
  }

  // ── Activities (Qontak tasks) ─────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    return this.listWhole<RawQontakActivity, Activity>(
      credentials,
      params,
      'tasks',
      transformActivity,
    )
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    return this.getOne<RawQontakActivity, Activity>(credentials, 'tasks', id, transformActivity)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    // TODO: verify endpoint path
    const res = await this.client(credentials).post<{ data: RawQontakActivity }>(
      '/api/open_api/v1/activities',
      body,
    )
    return transformActivity(res.data ?? (res as unknown as RawQontakActivity))
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    return this.listWhole<RawQontakNote, Note>(credentials, params, 'notes', transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    return this.getOne<RawQontakNote, Note>(credentials, 'notes', id, transformNote)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    // TODO: verify endpoint path
    const res = await this.client(credentials).post<{ data: RawQontakNote }>(
      '/api/open_api/v1/notes',
      body,
    )
    return transformNote(res.data ?? (res as unknown as RawQontakNote))
  }
}
