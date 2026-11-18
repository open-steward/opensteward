/**
 * Vincere adapter — CRM resource coverage for the OpenSteward CRM vertical.
 *
 * Vincere is a recruitment-focused CRM/ATS. The mapping to canonical CRM
 * objects is:
 *   Candidates  → Contacts
 *   Companies   → Companies
 *   Jobs        → Deals
 *   Activities  → Activities
 *   Notes       → Notes
 *
 * Auth: OAuth2 Authorization Code via id.vincere.io. After token exchange the
 * id_token must be sent as `id-token` header + the tenant `x-api-key` on every
 * REST request. Both are stored in credentials.extra.
 *
 * Base URL: https://{domain}.vincere.io/api/v2
 *
 * Paging (https://api.vincere.io/vapi.yaml):
 *   - Candidates, companies and jobs are read through
 *     `GET /<entity>/search/{matrix_vars}`, offset-paged by `start` ("From the
 *     set of matched results, return record numbers start from. Default to
 *     0") and `limit` ("Default to 25, max limit is 100."), with the end
 *     taken from `result.total`. `start` "is limited to 10000".
 *   - Activities come from `POST /activities` in fixed slices of 25, selected
 *     by `index` ("must be less than 400"), ending on `last`.
 *   - Pipelines and notes have no list endpoint and refuse with 501.
 *
 * Docs: https://api.vincere.io/ (spec: https://api.vincere.io/vapi.yaml)
 */

import { connectionScope, pageByRows, pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { VincereClient, tenantOf } from './client'
import {
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  refreshToken as doRefreshToken,
} from './auth'
import {
  CANDIDATE_SEARCH_FIELDS,
  transformCandidateSearchItem,
  transformContact,
  untransformContact,
  type RawVincereCandidate,
  type RawVincereCandidateSearchItem,
} from './transform/contact'
import {
  COMPANY_SEARCH_FIELDS,
  transformCompany,
  transformCompanySearchItem,
  untransformCompany,
  type RawVincereCompany,
  type RawVincereCompanySearchItem,
} from './transform/company'
import {
  POSITION_SEARCH_FIELDS,
  transformDeal,
  transformPositionSearchItem,
  untransformDeal,
  type RawVincereJob,
  type RawVincerePositionSearchItem,
} from './transform/deal'
import {
  transformActivity,
  untransformActivity,
  type RawVincereActivity,
} from './transform/activity'
import { transformNote, untransformNote, type RawVincereNote } from './transform/note'
import {
  DEFAULT_VINCERE_SCOPES,
  VINCERE_ACTIVITY_SLICE_LIMIT,
  VINCERE_DEFAULT_PAGE_SIZE,
  VINCERE_SEARCH_MAX_LIMIT,
  VINCERE_SEARCH_MAX_START,
} from './constants'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/** POST /activities: "Each call returns a slice of maximum 25 activities." */
interface VincereActivitySlice {
  slice_index?: number | null
  num_of_elements?: number | null
  last?: boolean | null
  content?: RawVincereActivity[]
}

export interface VincereAdapterConfig {
  /** OAuth2 client ID from Vincere Settings → App Store. */
  clientId?: string
  /** OAuth2 redirect URI registered in Vincere. */
  redirectUri?: string
  /** OAuth scopes to request. Defaults to DEFAULT_VINCERE_SCOPES when omitted. */
  scopes?: string[]
}

export class VincereAdapter implements CrmAdapter {
  readonly platform = 'vincere'
  readonly version = '0.1.0'
  /** Every search: "Limit on the number of records to return. Default to 25, max limit is 100." */
  readonly capabilities = { maxPageSize: VINCERE_SEARCH_MAX_LIMIT }

  private clientId: string | undefined
  private redirectUri: string | undefined
  private scopes: string[]

  constructor(config: VincereAdapterConfig = {}) {
    this.clientId = config.clientId
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? [...DEFAULT_VINCERE_SCOPES]
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(
      {
        clientId: this.clientId ?? '',
        redirectUri: this.redirectUri ?? '',
        scopes: overrideScopes ?? this.scopes,
      },
      state,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    if (!this.clientId) {
      throw new Error('Vincere exchangeCode: clientId required')
    }
    return doExchangeCode({ clientId: this.clientId, redirectUri }, code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) return credentials
    const clientId =
      this.clientId ?? (credentials.extra as Record<string, string> | undefined)?.['clientId'] ?? ''
    return doRefreshToken({ clientId }, credentials)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): VincereClient {
    return new VincereClient(credentials)
  }

  /**
   * One caller page of `GET /<entity>/search/<fl>;sort=id asc`, offset-paged
   * by `start` and `limit`, reporting the end from `result.total`.
   */
  private async searchPage<R>(
    credentials: Credentials,
    entity: 'candidate' | 'company' | 'position',
    fields: readonly string[],
    params: QueryParams,
  ): Promise<R[]> {
    const asked = params.limit ?? VINCERE_DEFAULT_PAGE_SIZE
    const limit = Math.max(1, Math.min(Math.floor(asked), VINCERE_SEARCH_MAX_LIMIT))
    const start = pageOffset(params, limit)
    if (start > VINCERE_SEARCH_MAX_START) {
      throw notSupported(
        `Vincere cannot page ${entity} search past row ${VINCERE_SEARCH_MAX_START}: "As of 12.11.0, start param is limited to 10000."`,
      )
    }
    const res = await this.client(credentials).search<R>(
      `/${entity}/search/fl=${fields.join(',')};sort=id asc`,
      { start, limit },
    )
    const items = res.result?.items ?? []
    const total = res.result?.total
    reportUpstreamPage(params, {
      ...(typeof total === 'number'
        ? { totalCount: total, hasMore: start + items.length < total }
        : {}),
      ...(limit < asked ? { pageSize: limit } : {}),
    })
    return items
  }

  // ── Contacts (Candidates) ─────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const items = await this.searchPage<RawVincereCandidateSearchItem>(
      credentials,
      'candidate',
      CANDIDATE_SEARCH_FIELDS,
      params,
    )
    return items.map(transformCandidateSearchItem)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawVincereCandidate>(`/candidate/${id}`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).post<RawVincereCandidate>(
      '/candidate',
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const raw = await this.client(credentials).put<RawVincereCandidate>(
      `/candidate/${id}`,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/candidate/${id}`)
  }

  // ── Companies ──────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const items = await this.searchPage<RawVincereCompanySearchItem>(
      credentials,
      'company',
      COMPANY_SEARCH_FIELDS,
      params,
    )
    return items.map(transformCompanySearchItem)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawVincereCompany>(`/company/${id}`)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    // POST /company answers only `{ "id": 11234 }`; read the record back.
    const { id } = await this.client(credentials).post<{ id: number }>(
      '/company',
      untransformCompany(data),
    )
    return this.getCompany(credentials, String(id))
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    // PUT /company/{id} answers only `{ "id": 11234 }`; read the record back.
    await this.client(credentials).put<{ id: number }>(`/company/${id}`, untransformCompany(data))
    return this.getCompany(credentials, id)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/company/${id}`)
  }

  // ── Deals (Jobs) ──────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const items = await this.searchPage<RawVincerePositionSearchItem>(
      credentials,
      'position',
      POSITION_SEARCH_FIELDS,
      params,
    )
    return items.map(transformPositionSearchItem)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawVincereJob>(`/position/${id}`)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    // Write methods are out of this rebuild's scope and keep HEAD's shape:
    // `/job` is not in the spec (it documents POST /position, PUT
    // /position/{id}); see the rebuild record's writeMethodsOnFakePaths.
    const raw = await this.client(credentials).post<RawVincereJob>('/job', untransformDeal(data))
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).put<RawVincereJob>(
      `/job/${id}`,
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/job/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  // Vincere's spec has no pipeline path among its 315; its Search section:
  // "There are FOUR endpoints you can run a search on: Candidates, Contacts,
  // Jobs & Companies."

  async listPipelines(_credentials: Credentials, _params: QueryParams): Promise<Pipeline[]> {
    throw notSupported(
      'Vincere cannot list pipelines: its API documents no pipeline endpoint ("There are FOUR endpoints you can run a search on: Candidates, Contacts, Jobs & Companies.")',
    )
  }

  async getPipeline(_credentials: Credentials, _id: string): Promise<Pipeline> {
    throw notSupported('Vincere cannot read a pipeline: its API documents no pipeline endpoint')
  }

  // ── Activities ─────────────────────────────────────────────────────────────

  /**
   * POST /activities ("Search activities"): "Each call returns a slice of
   * maximum 25 activities. Each slice has its index and a field to indicate if
   * it is the last slice." Slices are fixed-size, so the caller's pages are
   * cut from them by pageByRows. `index` "must be less than 400": a page
   * past slice 399 is refused.
   */
  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const client = this.client(credentials)
    const key = `vincere:activities:${connectionScope(tenantOf(credentials), credentials)}`
    const { items } = await pageByRows<Activity, number>(key, params, async (cursor) => {
      const index = cursor ?? 0
      if (index >= VINCERE_ACTIVITY_SLICE_LIMIT) {
        throw notSupported(
          `Vincere cannot list activities past slice ${VINCERE_ACTIVITY_SLICE_LIMIT - 1}: "index must be less than 400."`,
        )
      }
      const slice = await client.post<VincereActivitySlice>('/activities', {}, { index })
      const content = slice.content ?? []
      // `last` is the documented end signal. An empty slice that omits it
      // holds nothing to lose; a non-empty one would leave the end a guess.
      if (typeof slice.last !== 'boolean' && content.length > 0) {
        throw new Error(`Vincere activity slice ${index} did not say whether it is the last`)
      }
      return {
        items: content.map(transformActivity),
        next: slice.last === false ? index + 1 : undefined,
      }
    })
    return items
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).get<RawVincereActivity>(`/activities/${id}`)
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const raw = await this.client(credentials).post<RawVincereActivity>(
      '/activity',
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const raw = await this.client(credentials).put<RawVincereActivity>(
      `/activity/${id}`,
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/activity/${id}`)
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  // The spec documents notes only per candidate ("GET /candidate/{id}/notes":
  // "Get candidate's notes."); there is no /note path and no note search.

  async listNotes(_credentials: Credentials, _params: QueryParams): Promise<Note[]> {
    throw notSupported(
      'Vincere cannot list notes: its API documents notes only per candidate (GET /candidate/{id}/notes, "Get candidate\'s notes."), with no note search ("There are FOUR endpoints you can run a search on: Candidates, Contacts, Jobs & Companies.")',
    )
  }

  async getNote(_credentials: Credentials, _id: string): Promise<Note> {
    throw notSupported(
      'Vincere cannot read a note by id: its API documents no /note/{id} path, only GET /candidate/{id}/notes',
    )
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).post<RawVincereNote>('/note', untransformNote(data))
    return transformNote(raw)
  }

  async updateNote(credentials: Credentials, id: string, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).put<RawVincereNote>(
      `/note/${id}`,
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/note/${id}`)
  }
}
