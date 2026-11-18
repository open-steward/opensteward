/**
 * Gainsight NXT adapter for the OpenSteward CRM vertical.
 *
 * Maps the Gainsight NXT REST APIs to canonical CRM resources.
 * Docs: https://support.gainsight.com/gainsight_nxt/API_and_Developer_Docs
 *
 * ── Auth ──────────────────────────────────────────────────────────────────
 *   API key passed via the `Accesskey` request header on every call.
 *   credentials.accessToken = access key (does not expire)
 *   credentials.extra.domain = tenant subdomain (e.g. "acme" for acme.gainsightcloud.com)
 *     — required for CTA/Activity and Timeline/Note endpoints; Company and
 *       Person APIs use fixed gainsightcloud.com subdomains.
 *
 * ── Coverage ──────────────────────────────────────────────────────────────
 *
 * Implemented:
 *   Contacts   — get, create, update               (Gainsight People API;
 *                list refused 501: no documented list/query endpoint)
 *   Companies  — list, get, create, update, delete (Gainsight Company API)
 *   Activities — list, get, create, update         (Gainsight CTA API)
 *   Notes      — list, get, create, update, delete (Gainsight Timeline API)
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: deal     — Renewal Center API is write-only (no GET/list endpoint); opportunities cannot be read back via the documented REST API
 * Unavailable: pipeline — Gainsight NXT has no sales pipeline concept or pipeline listing endpoint in its REST API
 */

import { customForm, pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { GainsightClient } from './client'
import {
  COMPANY_BASE_URL,
  PERSON_BASE_URL,
  COCKPIT_PATH_PREFIX,
  DEFAULT_PAGE_SIZE,
  READ_API_MAX_PAGE_SIZE,
} from './constants'
import { transformContact, untransformContact, type RawGainsightPerson } from './transform/contact'
import { transformCompany, untransformCompany, type RawGainsightCompany } from './transform/company'
import { transformActivity, untransformActivity, type RawGainsightCta } from './transform/activity'
import { transformNote, untransformNote, type RawGainsightTimeline } from './transform/note'

// ── Credential form ────────────────────────────────────────────────────────
// Gainsight requires both an API key AND a tenant subdomain.

const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'apiKey',
      label: 'API Access Key',
      type: 'password',
      required: true,
      helpText: 'Generate under Administration > Connectors 2.0 > API Access Key in Gainsight.',
    },
    {
      name: 'domain',
      label: 'Tenant Domain',
      type: 'text',
      required: false,
      placeholder: 'yourcompany',
      helpText:
        'Your Gainsight subdomain (the "yourcompany" part of yourcompany.gainsightcloud.com). Required for CTA/Activity endpoints.',
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const key = (fields['apiKey'] ?? '').trim()
    if (!key) throw new Error('API Access Key is required.')
    const domain = (fields['domain'] ?? '').trim() || undefined
    return {
      accessToken: key,
      extra: domain ? { domain } : undefined,
    }
  },
})

// ── Gainsight response wrappers ────────────────────────────────────────────

interface GainsightListResponse<T> {
  result?: boolean
  data?:
    | {
        records?: T[]
        total?: number
        offset?: number
      }
    | T[]
  records?: T[]
}

interface GainsightItemResponse<T> {
  result?: boolean
  data?: T
}

interface GainsightUpsertResponse {
  result?: boolean
  data?: {
    success?: Array<{ gsid?: string }>
    failure?: unknown[]
  }
  requestId?: string
}

interface GainsightCtaListResponse {
  result?: boolean
  data?: {
    ctas?: RawGainsightCta[]
    total?: number
    pageNumber?: number
    pageSize?: number
  }
}

function extractRecords<T>(res: GainsightListResponse<T>): T[] {
  if (!res) return []
  if (Array.isArray(res)) return res as T[]
  const data = res.data
  if (!data) return res.records ?? []
  if (Array.isArray(data)) return data
  return data.records ?? []
}

export class GainsightAdapter implements CrmAdapter {
  readonly platform = 'gainsight'
  readonly version = '0.1.0'

  // ── Connect Link credential form ────────────────────────────────────────

  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  // ── Auth ─────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Gainsight uses API key auth, not OAuth2.
    return ''
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // Not used for API key auth; pass key directly.
    return { accessToken: code }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API key never expires.
    return credentials
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): GainsightClient {
    return new GainsightClient(credentials)
  }

  // ── Contacts (People API) ─────────────────────────────────────────────────

  async listContacts(_credentials: Credentials, _params: QueryParams): Promise<Contact[]> {
    // The People API documents upsert, delete, bulk ingestion and two
    // single-record reads (by GSID, by Email), but no list or query endpoint.
    // https://support.gainsight.com/gainsight_nxt/API_and_Developer_Docs/Person_API/People_API_Documentation
    throw Object.assign(
      new Error(
        'Gainsight cannot list contacts: the People API documents only single-record reads ("Get API allows you to get one record per API call from the Person, Company Person, and Relationship Person objects associated with a Person GSID passed in the Endpoint URL.")',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = this.client(credentials)
    const url = `${PERSON_BASE_URL}/v1/peoplemgmt/v1.0/people/${encodeURIComponent(id)}`
    // Documented success response: { "result": true, "requestId": "…",
    // "data": { "gsid": "…", "email": "…", "firstname": "…", … } }. The
    // documented failure shape is { "result": false, …, "data": {} }.
    const res = await client.get<GainsightItemResponse<RawGainsightPerson>>(url)
    const raw = res?.data
    if (!raw?.gsid) {
      throw Object.assign(new Error(`Gainsight: contact ${id} not found`), { statusCode: 404 })
    }
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = this.client(credentials)
    const url = `${PERSON_BASE_URL}/v1/peoplemgmt/v1.0/people`
    const body = untransformContact(data)
    const res = await client.put<GainsightUpsertResponse>(url, body)
    // Upsert returns GSID of created record
    const gsid = res?.data?.success?.[0]?.gsid
    if (gsid) {
      return this.getContact(credentials, gsid)
    }
    // Fall back to re-fetching by email
    if (data.email) {
      const emailUrl = `${PERSON_BASE_URL}/v1/peoplemgmt/v1.0/people/email/${encodeURIComponent(data.email)}`
      const fetched = await client.get<
        GainsightItemResponse<RawGainsightPerson> | RawGainsightPerson
      >(emailUrl)
      const raw: RawGainsightPerson =
        (fetched as GainsightItemResponse<RawGainsightPerson>).data ??
        (fetched as RawGainsightPerson)
      return transformContact(raw)
    }
    throw new Error('Gainsight: contact creation returned no usable ID')
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = this.client(credentials)
    const url = `${PERSON_BASE_URL}/v1/peoplemgmt/v1.0/people`
    const body = { ...untransformContact(data), Gsid: id }
    await client.put<GainsightUpsertResponse>(url, body)
    return this.getContact(credentials, id)
  }

  // ── Companies (Company API) ───────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    // Read API: body limit + 0-based offset, at most 5000 rows per call, no
    // total or has-more in the response — a full page is the only "more" hint.
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, READ_API_MAX_PAGE_SIZE)
    const offset = pageOffset(params, limit)
    const client = this.client(credentials)
    const url = `${COMPANY_BASE_URL}/v1/data/objects/query/Company`
    const res = await client.post<GainsightListResponse<RawGainsightCompany>>(url, {
      select: [
        'Gsid',
        'Name',
        'Industry',
        'Stage',
        'Status',
        'Employees',
        'Phone',
        'Website',
        'CreatedDate',
        'ModifiedDate',
      ],
      limit,
      offset,
    })
    const records = extractRecords(res)
    reportUpstreamPage(params, { hasMore: records.length === limit, pageSize: limit })
    return records.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const client = this.client(credentials)
    const url = `${COMPANY_BASE_URL}/v1/data/objects/query/Company`
    const res = await client.post<GainsightListResponse<RawGainsightCompany>>(url, {
      select: [
        'Gsid',
        'Name',
        'Industry',
        'Stage',
        'Status',
        'Employees',
        'Phone',
        'Website',
        'CreatedDate',
        'ModifiedDate',
      ],
      where: {
        conditions: [{ name: 'Gsid', alias: 'A', value: [id], operator: 'EQ' }],
        expression: 'A',
      },
      limit: 1,
    })
    const records = extractRecords(res)
    const raw = records[0]
    if (!raw) {
      throw Object.assign(new Error(`Gainsight: company ${id} not found`), { statusCode: 404 })
    }
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const client = this.client(credentials)
    const url = `${COMPANY_BASE_URL}/v1/data/objects/Company`
    const body = { records: [untransformCompany(data)] }
    const res = await client.post<GainsightUpsertResponse>(url, body)
    const gsid = res?.data?.success?.[0]?.gsid
    if (!gsid) throw new Error('Gainsight: company creation returned no GSID')
    return this.getCompany(credentials, gsid)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const client = this.client(credentials)
    const url = `${COMPANY_BASE_URL}/v1/data/objects/Company?keys=Gsid`
    const body = { records: [{ ...untransformCompany(data), Gsid: id }] }
    await client.put<GainsightUpsertResponse>(url, body)
    return this.getCompany(credentials, id)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    const client = this.client(credentials)
    const url = `${COMPANY_BASE_URL}/v1/data/objects/Company/${encodeURIComponent(id)}`
    await client.delete(url)
  }

  // ── Activities (CTA API) ──────────────────────────────────────────────────

  private cockpitUrl(client: GainsightClient, path: string): string {
    return `${client.cockpitBase()}${COCKPIT_PATH_PREFIX}${path}`
  }

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const client = this.client(credentials)
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const page = Number(params['page'] ?? 1)
    const url = this.cockpitUrl(client, '/cta/list')
    const res = await client.post<GainsightCtaListResponse>(url, {
      pageSize: limit,
      pageNumber: page,
    })
    const ctas = res?.data?.ctas ?? []
    return ctas.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const client = this.client(credentials)
    const url = this.cockpitUrl(client, '/cta/list')
    const res = await client.post<GainsightCtaListResponse>(url, {
      filterCriteria: {
        conditions: [{ name: 'gsid', alias: 'A', value: [id], operator: 'EQ' }],
        expression: 'A',
      },
      pageSize: 1,
      pageNumber: 1,
    })
    const cta = res?.data?.ctas?.[0]
    if (!cta) {
      throw Object.assign(new Error(`Gainsight: activity (CTA) ${id} not found`), {
        statusCode: 404,
      })
    }
    return transformActivity(cta)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const client = this.client(credentials)
    const url = this.cockpitUrl(client, '/cta/')
    const body = { requests: [{ record: untransformActivity(data) }] }
    const res = await client.post<GainsightUpsertResponse>(url, body)
    const gsid = res?.data?.success?.[0]?.gsid
    if (!gsid) throw new Error('Gainsight: CTA creation returned no GSID')
    return this.getActivity(credentials, gsid)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const client = this.client(credentials)
    const url = this.cockpitUrl(client, '/cta/')
    const body = {
      requests: [{ record: { ...untransformActivity(data), gsid: id } }],
    }
    await client.put<GainsightUpsertResponse>(url, body)
    return this.getActivity(credentials, id)
  }

  // ── Notes (Timeline API) ──────────────────────────────────────────────────
  //
  // Gainsight Timeline activities are the closest analogue to CRM notes.
  // Query endpoint: POST {tenant}/v1/data/objects/query/activity_timeline
  // Write endpoint: POST/PUT {tenant}/v1/ant/es/activity
  // Docs: https://support.gainsight.com/gainsight_nxt/API_and_Developer_Docs/Timeline_API/Timeline_APIs

  private timelineBase(client: GainsightClient): string {
    return client.cockpitBase()
  }

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const client = this.client(credentials)
    // Same Read API body as Company (limit + 0-based offset, no total). The
    // Timeline page states no maximum; 5000 is the Read API family's ceiling.
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, READ_API_MAX_PAGE_SIZE)
    const offset = pageOffset(params, limit)
    const url = `${this.timelineBase(client)}/v1/data/objects/query/activity_timeline`
    const res = await client.post<GainsightListResponse<RawGainsightTimeline>>(url, {
      select: [
        'Gsid',
        'Subject',
        'Notes',
        'GsCompanyId',
        'AuthorId',
        'ExternalId',
        'CreatedDate',
        'ModifiedDate',
        'contextname',
      ],
      limit,
      offset,
      orderBy: { CreatedDate: 'desc' },
    })
    const records = extractRecords(res)
    reportUpstreamPage(params, { hasMore: records.length === limit, pageSize: limit })
    return records.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const client = this.client(credentials)
    const url = `${this.timelineBase(client)}/v1/data/objects/query/activity_timeline`
    const res = await client.post<GainsightListResponse<RawGainsightTimeline>>(url, {
      select: [
        'Gsid',
        'Subject',
        'Notes',
        'GsCompanyId',
        'AuthorId',
        'ExternalId',
        'CreatedDate',
        'ModifiedDate',
        'contextname',
      ],
      where: {
        conditions: [{ name: 'Gsid', alias: 'A', value: [id], operator: 'EQ' }],
        expression: 'A',
      },
      limit: 1,
    })
    const records = extractRecords(res)
    const raw = records[0]
    if (!raw) {
      throw Object.assign(new Error(`Gainsight: timeline activity (note) ${id} not found`), {
        statusCode: 404,
      })
    }
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const client = this.client(credentials)
    const url = `${this.timelineBase(client)}/v1/ant/es/activity`
    const externalId = `opensteward-${Date.now()}`
    const body = {
      ...untransformNote(data),
      ExternalId: externalId,
      // Default context to Company when a company_id is provided, otherwise omit.
      ...(data.company_id ? { ContextName: 'Company', GsCompanyId: data.company_id } : {}),
    }
    const res = await client.post<{
      result?: boolean
      data?: { success?: Record<string, Array<{ activityId?: string }>> }
    }>(url, body)
    // Response: { data: { success: { [externalId]: [{ activityId: "<gsid>" }] } } }
    const successEntries = res?.data?.success ?? {}
    const firstEntry = Object.values(successEntries)[0]
    const gsid = firstEntry?.[0]?.activityId
    if (!gsid) throw new Error('Gainsight: timeline activity creation returned no activityId')
    return this.getNote(credentials, gsid)
  }

  async updateNote(credentials: Credentials, id: string, data: Partial<Note>): Promise<Note> {
    const client = this.client(credentials)
    const url = `${this.timelineBase(client)}/v1/ant/es/activity?identifier=activityid`
    const body = {
      ...untransformNote(data),
      ActivityId: id,
    }
    await client.put<{ result?: boolean }>(url, body)
    return this.getNote(credentials, id)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    const client = this.client(credentials)
    // The Timeline DELETE endpoint accepts a JSON body with activityIds.
    // GainsightClient.delete() does not support a body; call fetch directly via the client's accessKey.
    // We POST to the delete sub-path as documented: DELETE /v1/ant/es/activity with body { activityIds }
    const url = `${this.timelineBase(client)}/v1/ant/es/activity`
    await client.delete(`${url}?activityIds=${encodeURIComponent(id)}`)
  }
}
