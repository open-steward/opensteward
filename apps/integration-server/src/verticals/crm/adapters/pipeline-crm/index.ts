/**
 * Pipeline CRM adapter for the CRM vertical.
 *
 * Maps the Pipeline CRM REST API v3 to canonical CRM resources.
 * Docs: https://app.pipelinecrm.com/api/docs
 *
 * ── Auth ─────────────────────────────────────────────────────────────────
 *   Bearer token passed as `Authorization: Bearer {api_key}` header.
 *   credentials.accessToken = API key
 *   (Settings → API tab → API Keys)
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (13):
 *   Contacts (People): list, get, create
 *   Companies:         list, get, create
 *   Deals:             list, get, create
 *   Activities:        list, get, create
 *   Notes:             list, get, create
 *   Pipelines:         list (/admin/deal_pipelines + /admin/deal_stages)
 *
 * Webhooks:
 *   Pipeline CRM has no documented webhook signing scheme — verifyWebhook
 *   and parseWebhookEvents are not implemented; the registry returns 501.
 */

import { reportUpstreamPage, simpleApiKey } from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { PipelineCrmClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import {
  transformContact,
  untransformContact,
  type RawPipelineCrmPerson,
} from './transform/contact'
import {
  transformCompany,
  untransformCompany,
  type RawPipelineCrmCompany,
} from './transform/company'
import { transformDeal, untransformDeal, type RawPipelineCrmDeal } from './transform/deal'
import {
  transformPipeline,
  type RawPipelineCrmDealPipeline,
  type RawPipelineCrmDealStage,
} from './transform/pipeline'
import {
  transformActivity,
  untransformActivity,
  type RawPipelineCrmActivity,
} from './transform/activity'
import { transformNote, untransformNote, type RawPipelineCrmNote } from './transform/note'

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'API Key',
  helpText: 'Found in Pipeline CRM Settings → API tab → API Keys.',
})

/** Pipeline CRM API list endpoints wrap results in `{ entries: [...] }`. */
interface PipelineCrmListResponse<T> {
  entries: T[]
}

/**
 * The documented list envelope, `{ entries, pagination }`. From the
 * `Pagination` schema in https://app.pipelinecrm.com/openapi.json:
 *   page:  "The page returned. Request another with `?page=N`."
 *   total: "Total number of records matching the request across all pages."
 *   per_page: "Page size. `?per_page=N`, capped at 200."
 *   total: "Total number of records matching the request across all pages."
 *   pages: "Number of pages at this `per_page`."
 * `pages` is optional: the schema requires only `entries` and `pagination`,
 * and both https://app.pipelinecrm.com/llms/getting-started.md examples omit it
 * (`"pagination": { "page": 1, "per_page": 5, "total": 812 }`). The end of a
 * collection is therefore read from `page`, `per_page` and `total`, which every
 * documented example carries.
 */
interface PipelineCrmPagedResponse<T> {
  entries: T[]
  pagination: { page: number; per_page: number; total: number; pages?: number }
}

/** Whether rows remain after this page, from the documented page, per_page and total. */
function hasMoreAfter(pagination: PipelineCrmPagedResponse<unknown>['pagination']): boolean {
  return pagination.page * pagination.per_page < pagination.total
}

export class PipelineCrmAdapter implements CrmAdapter {
  readonly platform = 'pipeline-crm'
  readonly version = '0.1.0'

  /** Documented: "There is a hard limit of **200** items for any request." */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Pipeline CRM uses an API key, not OAuth2.
    return ''
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // Caller passes the API key as `code`.
    return { accessToken: code }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys do not expire.
    return credentials
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): PipelineCrmClient {
    return new PipelineCrmClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, string> {
    const p: Record<string, string> = {
      per_page: String(params.limit ?? DEFAULT_PAGE_SIZE),
    }
    if (params['page']) p['page'] = String(params['page'])
    return p
  }

  // ── Contacts (Pipeline CRM "People") ──────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const res = await this.client(credentials).get<PipelineCrmListResponse<RawPipelineCrmPerson>>(
      '/people',
      this.pageParams(params),
    )
    return (res.entries ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawPipelineCrmPerson>(`/people/${id}`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).post<RawPipelineCrmPerson>('/people', {
      person: untransformContact(data),
    })
    return transformContact(raw)
  }

  // ── Companies ──────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const res = await this.client(credentials).get<PipelineCrmListResponse<RawPipelineCrmCompany>>(
      '/companies',
      this.pageParams(params),
    )
    return (res.entries ?? []).map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawPipelineCrmCompany>(`/companies/${id}`)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).post<RawPipelineCrmCompany>('/companies', {
      company: untransformCompany(data),
    })
    return transformCompany(raw)
  }

  // ── Deals ──────────────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const res = await this.client(credentials).get<PipelineCrmListResponse<RawPipelineCrmDeal>>(
      '/deals',
      this.pageParams(params),
    )
    return (res.entries ?? []).map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawPipelineCrmDeal>(`/deals/${id}`)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).post<RawPipelineCrmDeal>('/deals', {
      deal: untransformDeal(data),
    })
    return transformDeal(raw)
  }

  // ── Pipelines (GET /admin/deal_pipelines + GET /admin/deal_stages) ────────

  /**
   * https://app.pipelinecrm.com/llms/deal-pipelines.md, GET /admin/deal_pipelines:
   *   "| `page` | query | integer | no | Page number |"
   *   "| `per_page` | query | integer | no | Records per page, at most 200 |"
   *
   * Pipelines carry no stage list ("won_stage, lost_stage" only), so stages
   * come from GET /admin/deal_stages (https://app.pipelinecrm.com/llms/deal-stages.md,
   * "May be read by non-admins"), grouped by the documented `deal_pipeline_id`.
   * That endpoint declares no parameters but returns the paginated
   * `DealStageList` ("Paginated deal stages"), so every page is walked with
   * `?page=N` until `pagination.pages`.
   */
  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const client = this.client(credentials)
    const page = params.page ?? 1
    const requested = params.limit ?? DEFAULT_PAGE_SIZE
    const perPage = Math.min(requested, MAX_PAGE_SIZE)
    const res = await client.get<PipelineCrmPagedResponse<RawPipelineCrmDealPipeline>>(
      '/admin/deal_pipelines',
      { page: String(page), per_page: String(perPage) },
    )
    reportUpstreamPage(params, {
      totalCount: res.pagination.total,
      ...(res.pagination.pages !== undefined ? { totalPages: res.pagination.pages } : {}),
      currentPage: res.pagination.page,
      hasMore: hasMoreAfter(res.pagination),
      ...(perPage < requested ? { pageSize: perPage } : {}),
    })
    if (res.entries.length === 0) return []

    const byPipeline = new Map<number, RawPipelineCrmDealStage[]>()
    for (let stagePage = 1; ; stagePage++) {
      const stages = await client.get<PipelineCrmPagedResponse<RawPipelineCrmDealStage>>(
        '/admin/deal_stages',
        { page: String(stagePage) },
      )
      for (const stage of stages.entries) {
        if (stage.deal_pipeline_id == null) continue
        const list = byPipeline.get(stage.deal_pipeline_id) ?? []
        list.push(stage)
        byPipeline.set(stage.deal_pipeline_id, list)
      }
      if (stages.entries.length === 0 || !hasMoreAfter(stages.pagination)) break
    }
    return res.entries.map((p) => transformPipeline(p, byPipeline.get(p.id) ?? []))
  }

  // ── Activities ─────────────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const res = await this.client(credentials).get<PipelineCrmListResponse<RawPipelineCrmActivity>>(
      '/calendar_entries',
      this.pageParams(params),
    )
    return (res.entries ?? []).map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).get<RawPipelineCrmActivity>(
      `/calendar_entries/${id}`,
    )
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const raw = await this.client(credentials).post<RawPipelineCrmActivity>('/calendar_entries', {
      calendar_entry: untransformActivity(data),
    })
    return transformActivity(raw)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const res = await this.client(credentials).get<PipelineCrmListResponse<RawPipelineCrmNote>>(
      '/notes',
      this.pageParams(params),
    )
    return (res.entries ?? []).map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.client(credentials).get<RawPipelineCrmNote>(`/notes/${id}`)
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).post<RawPipelineCrmNote>('/notes', {
      note: untransformNote(data),
    })
    return transformNote(raw)
  }
}
