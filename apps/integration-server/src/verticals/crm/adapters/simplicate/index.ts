/**
 * Simplicate adapter for the CRM vertical.
 *
 * Maps the Simplicate REST API v2 to canonical CRM resources.
 * Docs: https://developer.simplicate.com/docs/api/v2/getting_started/
 *
 * ── Auth ─────────────────────────────────────────────────────────────────
 *   Credentials collected via customForm (subdomain + API key + API secret).
 *     credentials.accessToken     = Authentication-Key header value
 *     credentials.extra.apiSecret = Authentication-Secret header value
 *     credentials.extra.subdomain = customer subdomain (foo.simplicate.nl)
 *
 * ── Base URL ──────────────────────────────────────────────────────────────
 *   https://{subdomain}.simplicate.nl/api/v2
 *
 * ── Pagination ────────────────────────────────────────────────────────────
 *   limit / offset query params, at most 100 records per page
 *   (https://developer.simplicate.com/docs/api/v2/filtering). A caller page
 *   is one upstream page: offset = (page - 1) × size, with size the caller's
 *   limit clamped to 100 and reported as pageSize when smaller.
 *   metadata=count gives the total, which makes hasMore exact.
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (12; activity reads refuse):
 *   Contacts   : listContacts, getContact, createContact, updateContact
 *   Companies  : listCompanies, getCompany, createCompany
 *   Deals      : listDeals, getDeal, createDeal (via /sales/sales)
 *   Notes      : createNote (stores note on person/org; Simplicate has no
 *                standalone note list endpoint in the REST API v2)
 *   Activities : listActivities, getActivity refuse with 501: the v2 API
 *                documents no activity/appointment endpoint.
 *                createActivity, updateActivity still call the undocumented
 *                /crm/appointment (write methods, not reworked here)
 *   Pipelines  : listPipelines, getPipeline (via /sales/salesprogress —
 *                Simplicate has no named pipeline object; progress phases are
 *                synthesised into a single "Sales Pipeline" with stages)
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * (activity has writes only; its reads refuse, see Coverage)
 *
 * Omitted — registry returns HTTP 501 automatically:
 *   Webhooks  (Simplicate does not document a webhook signature scheme)
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import { pageLocally, pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { SimplicateClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { CREDENTIAL_FORM } from './auth'

import { transformContact, untransformContact, type RawSimplicatePerson } from './transform/contact'
import {
  transformCompany,
  untransformCompany,
  type RawSimplicateOrganization,
} from './transform/company'
import { transformDeal, untransformDeal, type RawSimplicateSales } from './transform/deal'
import { untransformNote, type RawSimplicateNote } from './transform/note'
import {
  transformActivity,
  untransformActivity,
  type RawSimplicateAppointment,
} from './transform/activity'
import {
  transformPipelineFromProgress,
  type RawSimplicateSalesProgress,
} from './transform/pipeline'

/** Safety stop for the phase walk: 100 pages of 100 phases. */
const MAX_PHASE_PAGES = 100

/** The v2 API documents no activity, appointment or agenda endpoint. */
function activitiesNotSupported(verb: 'list' | 'read'): Error {
  return Object.assign(
    new Error(
      `Simplicate cannot ${verb} activities: the v2 API (https://developer.simplicate.com/openapi/apiV2.json) documents no activity, appointment or agenda endpoint`,
    ),
    { statusCode: 501, code: 'NOT_SUPPORTED' },
  )
}

export class SimplicateAdapter implements CrmAdapter {
  // ── Connect Link ──────────────────────────────────────────────────────────

  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  readonly platform = 'simplicate'
  readonly version = '0.1.0'

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Simplicate uses API key + secret; no OAuth redirect URL.
    return ''
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    // Not used — credentials come from credentialFields form.
    return { accessToken: '' }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys do not expire.
    return credentials
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): SimplicateClient {
    return new SimplicateClient(credentials)
  }

  /**
   * One caller page of an offset-paged collection. The limit is clamped to
   * the documented 100-record ceiling, the offset strides by the size sent,
   * and metadata.count (requested by client.list) reports the end.
   */
  private async listPage<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
  ): Promise<T[]> {
    const asked = Math.floor(params.limit ?? DEFAULT_PAGE_SIZE)
    const size = Math.min(Math.max(asked, 1), MAX_PAGE_SIZE)
    const offset = pageOffset(params, size)
    const { items, total } = await this.client(credentials).list<T>(path, offset, size)
    if (typeof total === 'number') {
      reportUpstreamPage(params, {
        totalCount: total,
        hasMore: offset + items.length < total,
        pageSize: size,
      })
    } else {
      reportUpstreamPage(params, {
        pageSize: size,
        ...(items.length < size ? { hasMore: false } : {}),
      })
    }
    return items
  }

  /**
   * Every sales-progress phase, walked by offset at the 100-record ceiling
   * until metadata.count is reached or a short page comes back.
   */
  private async allProgressPhases(credentials: Credentials): Promise<RawSimplicateSalesProgress[]> {
    const client = this.client(credentials)
    const phases: RawSimplicateSalesProgress[] = []
    for (let page = 0; page < MAX_PHASE_PAGES; page++) {
      const offset = page * MAX_PAGE_SIZE
      const { items, total } = await client.list<RawSimplicateSalesProgress>(
        '/sales/salesprogress',
        offset,
        MAX_PAGE_SIZE,
      )
      phases.push(...items)
      if (items.length < MAX_PAGE_SIZE) return phases
      if (typeof total === 'number' && phases.length >= total) return phases
    }
    throw new Error(
      `Simplicate /sales/salesprogress returned more than ${MAX_PHASE_PAGES} full pages; refusing to truncate the pipeline`,
    )
  }

  // ── Contacts (CRM persons) ────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const items = await this.listPage<RawSimplicatePerson>(credentials, '/crm/person', params)
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawSimplicatePerson>(`/crm/person/${id}`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).post<RawSimplicatePerson>('/crm/person', body)
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).put<RawSimplicatePerson>(`/crm/person/${id}`, body)
    return transformContact(raw)
  }

  // ── Companies (CRM organizations) ─────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const items = await this.listPage<RawSimplicateOrganization>(
      credentials,
      '/crm/organization',
      params,
    )
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawSimplicateOrganization>(
      `/crm/organization/${id}`,
    )
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const raw = await this.client(credentials).post<RawSimplicateOrganization>(
      '/crm/organization',
      body,
    )
    return transformCompany(raw)
  }

  // ── Deals (Sales records) ──────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const items = await this.listPage<RawSimplicateSales>(credentials, '/sales/sales', params)
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawSimplicateSales>(`/sales/sales/${id}`)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const raw = await this.client(credentials).post<RawSimplicateSales>('/sales/sales', body)
    return transformDeal(raw)
  }

  // ── Pipelines (Sales progress phases) ────────────────────────────────────
  // Simplicate has no named pipeline object. Instead, /sales/salesprogress
  // returns the ordered progress phases that function as pipeline stages.
  // We expose the full phase list as a single synthesised "Sales Pipeline".

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const phases = await this.allProgressPhases(credentials)
    // The collection is the one synthesised pipeline, so it is paged here.
    return pageLocally([transformPipelineFromProgress(phases)], params)
  }

  async getPipeline(credentials: Credentials, _id: string): Promise<Pipeline> {
    return transformPipelineFromProgress(await this.allProgressPhases(credentials))
  }

  // ── Activities ────────────────────────────────────────────────────────────
  // Simplicate documents no activity, appointment or agenda resource: the
  // first-party OpenAPI (https://developer.simplicate.com/openapi/apiV2.json)
  // has no path containing "appointment", and the /crm/* paths it lists are
  // contactperson, country, debtor, document, documenttype, gender, industry,
  // interests, myorganizationprofile, organization, person, relationtype and
  // the custom-field endpoints. Both reads refuse before sending anything.
  // createActivity/updateActivity (write methods) still call the undocumented
  // /crm/appointment and are outside this change.

  async listActivities(_credentials: Credentials, _params: QueryParams): Promise<Activity[]> {
    throw activitiesNotSupported('list')
  }

  async getActivity(_credentials: Credentials, _id: string): Promise<Activity> {
    throw activitiesNotSupported('read')
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const raw = await this.client(credentials).post<RawSimplicateAppointment>(
      '/crm/appointment',
      body,
    )
    return transformActivity(raw)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const body = untransformActivity(data)
    const raw = await this.client(credentials).put<RawSimplicateAppointment>(
      `/crm/appointment/${id}`,
      body,
    )
    return transformActivity(raw)
  }

  // ── Notes ──────────────────────────────────────────────────────────────────
  // Simplicate stores notes as the `note` field on person/org records.
  // There is no dedicated GET /notes list endpoint in the REST API v2.
  // createNote updates the note field on the linked person or organization.

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const content = (data.content ?? '') as string

    if (data.contact_id) {
      // Patch the note onto the person record
      const raw = await this.client(credentials).put<RawSimplicateNote>(
        `/crm/person/${data.contact_id}`,
        { note: content },
      )
      return {
        id: String(raw?.id ?? data.contact_id),
        content,
        contact_id: data.contact_id,
        metadata: body,
      }
    }

    if (data.company_id) {
      const raw = await this.client(credentials).put<RawSimplicateNote>(
        `/crm/organization/${data.company_id}`,
        { note: content },
      )
      return {
        id: String(raw?.id ?? data.company_id),
        content,
        company_id: data.company_id,
        metadata: body,
      }
    }

    // No link provided — store on a timeline message as best effort
    const raw = await this.client(credentials).post<RawSimplicateNote>('/timeline/message', {
      title: 'Note',
      content,
    })
    return {
      id: String(raw?.id ?? 'unknown'),
      content,
      metadata: body,
    }
  }
}
