import {
  customForm,
  pageOffset,
  reportUpstreamPage,
  type CredentialField,
} from '@opensteward/shared'
/**
 * Salesmate adapter for the CRM vertical.
 *
 * Maps the Salesmate v4 REST API to canonical CRM resources.
 * Docs: https://apidocs.salesmate.io/ (a Postman Documenter page; the
 * collection JSON is
 * https://apidocs.salesmate.io/api/collections/7811505/S1ZucWTA?environment=7811505-de46b460-b7e9-4cd3-b80c-313458b5d95e&segregateAuth=true&versionTag=latest).
 *
 * Auth: `accessToken: <session token>` + `x-linkname: <link_name>.salesmate.io`
 * Base URL: https://<link_name>.salesmate.io/
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Reads on the documented v4 endpoints:
 *   Contacts:   list (POST /apis/contact/v4/search), get (GET /apis/contact/v4/{id})
 *   Companies:  list (POST /apis/company/v4/search), get (GET /apis/company/v4/{id})
 *   Deals:      list (POST /apis/deal/v4/search), get (GET /apis/deal/v4/{id})
 *   Activities: list (POST /apis/activity/v4/search), get (GET /apis/activity/v4/{id})
 *
 * Refused with 501 NOT_SUPPORTED, before any request:
 *   Pipelines list — no pipeline endpoint is documented; a deal names its
 *     pipeline as a string.
 *   Notes list/get — notes are documented only under one record
 *     (`/apis/module/v4/modules/:moduleId/objects/:objectId/notes`).
 *
 * Writes (create/update/delete) are unchanged from the previous version and
 * still call `api/v3/…` paths that the v4 docs do not contain.
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { SalesmateClient, normaliseLinkname } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { MAX_PAGE_SIZE, MODULE_ID } from './constants'
import { transformContact, untransformContact, type RawSalesmateContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawSalesmateCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawSalesmateDeal } from './transform/deal'
import {
  transformActivity,
  untransformActivity,
  type RawSalesmateActivity,
} from './transform/activity'
import { transformNote, untransformNote, type RawSalesmateNote } from './transform/note'

export interface SalesmateAdapterConfig {
  apiKey?: string
}

// ── Credential form ─────────────────────────────────────────────────────────
// Every documented request carries `x-linkname: link_name.salesmate.io` and
// is sent to https://link_name.salesmate.io/, so the link name is part of the
// documented auth. The token is the `accessToken` header's "Session Token";
// "Each user in Salesmate is provided with a set of unique Access Keys. To
// find your Access keys: Click your profile picture and select My Account.
// Click the Access Key tab."

const CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'linkname',
    label: 'Link name',
    type: 'text',
    placeholder: 'mycompany',
    helpText: 'The "link_name" of your Salesmate address, link_name.salesmate.io.',
    required: true,
  },
  {
    name: 'accessToken',
    label: 'Session token',
    type: 'password',
    helpText: 'My Account → Access Key tab in Salesmate. Sent as the accessToken header.',
    required: true,
  },
]

const CREDENTIAL_FORM = customForm({
  fields: CREDENTIAL_FIELDS,
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const linkname = (fields['linkname'] ?? '').trim()
    const token = (fields['accessToken'] ?? '').trim()
    if (!linkname) throw new Error('Link name is required.')
    if (!token) throw new Error('Session token is required.')
    return { accessToken: token, extra: { linkname: normaliseLinkname(linkname) } }
  },
})

// ── Refusals ───────────────────────────────────────────────────────────────

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

const NO_PIPELINE_ENDPOINT =
  'the v4 API reference (https://apidocs.salesmate.io/) documents no pipeline endpoint; a deal ' +
  'takes its pipeline as a name: "pipeline required String User can select any one pipeline ' +
  'from pre-defined pipelines."'

const NOTES_PER_RECORD_ONLY =
  'notes are documented only under a single record, "GET /apis/module/v4/modules/:moduleId/' +
  'objects/:objectId/notes" ("This api is used to retrieve all notes of a particular record."), ' +
  'and a note is read by "GET /apis/module/v4/modules/:moduleId/objects/:objectId/notes/:noteId"; ' +
  'there is no account-wide notes list or lookup by note id alone'

// ── Search bodies ──────────────────────────────────────────────────────────
// Each documented search request posts `displayingFields`, a `filterQuery`,
// a `sort`, the module's `moduleId`, `"reportType": "get_data"` and
// `"getRecordsCount": true`. The filter is the documented example's own
// "created after Jan 01, 1970" rule, i.e. every record. Sorting is by id,
// one of the fields "Order by will only work for", so offsets stay stable.

type SearchModule = 'contact' | 'company' | 'deal' | 'activity'

const MODULE_NAME: Record<SearchModule, string> = {
  contact: 'Contact',
  company: 'Company',
  deal: 'Deal',
  // Getting Started → Module Ids: "2 Task"; the activity search example's
  // rules carry "moduleName": "Task".
  activity: 'Task',
}

// `displayingFields` names the columns the search returns. Each entry is a
// field the docs name for that module (in a search body, a filter rule, the
// order-by list, an Add body or the Get a Contact response), written in the
// documented `<module>.<field>` / `<module>.<ref>.id` form. Without a column
// here, the transforms cannot read it from a list row.
const DISPLAYING_FIELDS: Record<SearchModule, string[]> = {
  contact: [
    'contact.id',
    'contact.name',
    'contact.firstName',
    'contact.lastName',
    'contact.email',
    'contact.phone',
    'contact.mobile',
    'contact.designation',
    'contact.company.id',
    'contact.owner.id',
    'contact.createdAt',
    'contact.lastModifiedAt',
  ],
  company: [
    'company.id',
    'company.name',
    'company.phone',
    'company.owner.id',
    'company.createdAt',
    'company.lastModifiedAt',
  ],
  deal: [
    'deal.id',
    'deal.title',
    'deal.dealValue',
    'deal.currency',
    'deal.status',
    'deal.stage',
    'deal.pipeline',
    'deal.primaryContact.id',
    'deal.primaryCompany.id',
    'deal.owner.id',
    'deal.estimatedCloseDate',
    'deal.createdAt',
    'deal.lastModifiedAt',
  ],
  activity: [
    'activity.id',
    'activity.title',
    'activity.type',
    'activity.description',
    'activity.isCompleted',
    'activity.primaryContact.id',
    'activity.primaryCompany.id',
    'activity.relatedTo.id',
    'activity.owner.id',
    'activity.createdAt',
    'activity.lastModifiedAt',
  ],
}

export function searchBody(module: SearchModule): Record<string, unknown> {
  return {
    displayingFields: DISPLAYING_FIELDS[module],
    filterQuery: {
      group: {
        operator: 'AND',
        rules: [
          {
            condition: 'IS_AFTER',
            moduleName: MODULE_NAME[module],
            field: {
              fieldName: `${module}.createdAt`,
              displayName: 'Created At',
              type: 'DateTime',
            },
            data: 'Jan 01, 1970 05:30 AM',
            eventType: 'DateTime',
          },
        ],
      },
    },
    sort: { fieldName: `${module}.id`, order: 'asc' },
    ...(module === 'deal' ? { pipeline: '' } : {}),
    moduleId: MODULE_ID[module],
    reportType: 'get_data',
    getRecordsCount: true,
  }
}

export class SalesmateAdapter implements CrmAdapter {
  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  readonly platform = 'salesmate'
  readonly version = '0.2.0'
  /** "A maximum of 250 records will be fetched in one request." */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  constructor(_config: SalesmateAdapterConfig = {}) {}

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

  private client(credentials: Credentials): SalesmateClient {
    return new SalesmateClient(credentials)
  }

  /**
   * One caller page of a v4 search. `rows` is the page size and `from` the
   * offset: "The `rows` and `from` query parameters control pagination",
   * "from (integer): The starting index of the records returned." (Search a
   * Custom Module Record). `Data.totalRows` is the platform's count.
   */
  private async searchPage<T>(
    credentials: Credentials,
    module: SearchModule,
    params: QueryParams,
  ): Promise<T[]> {
    const limit =
      typeof params.limit === 'number' && Number.isFinite(params.limit) && params.limit >= 1
        ? Math.floor(params.limit)
        : MAX_PAGE_SIZE
    const rows = Math.min(limit, MAX_PAGE_SIZE)
    const from = pageOffset(params, rows)
    const query: Record<string, number | string> = { rows, from }
    // Search an activity: ".../apis/activity/v4/search?rows=250&from=0&viewType=list"
    if (module === 'activity') query['viewType'] = 'list'
    const data = await this.client(credentials).search<T>(
      `apis/${module}/v4/search`,
      query,
      searchBody(module),
    )
    // A search answer without the documented `Data.data` array is not an
    // empty page: returning [] would tell a sync the collection ended here.
    if (!Array.isArray(data.data)) {
      throw Object.assign(
        new Error(`Salesmate ${module} search answered without the documented Data.data array`),
        { statusCode: 502 },
      )
    }
    const items = data.data
    // More rows than `rows` means the server did not apply the page size, so
    // `from` cannot be trusted either. Search a deal's documented URL has no
    // query string (the contact, company, activity and custom-module searches
    // document `?rows=…&from=…`), so this is the tripwire for a search that
    // ignores them: fail rather than serve a repeated first page as page N.
    if (items.length > rows) {
      throw Object.assign(
        new Error(
          `Salesmate ${module} search returned ${items.length} rows for rows=${rows}; the page size was not applied`,
        ),
        { statusCode: 502 },
      )
    }
    const total = data.totalRows
    reportUpstreamPage(params, {
      ...(typeof total === 'number'
        ? { totalCount: total, hasMore: from + items.length < total }
        : {}),
      ...(rows < limit ? { pageSize: rows } : {}),
    })
    return items
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const items = await this.searchPage<RawSalesmateContact>(credentials, 'contact', params)
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<RawSalesmateContact>(
      `apis/contact/v4/${encodeURIComponent(id)}`,
    )
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).post<RawSalesmateContact>('api/v3/contacts', body)
    return transformContact(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).put<RawSalesmateContact>(
      `api/v3/contacts/${id}`,
      body,
    )
    return transformContact(res)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`api/v3/contacts/${id}`)
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const items = await this.searchPage<RawSalesmateCompany>(credentials, 'company', params)
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const res = await this.client(credentials).get<RawSalesmateCompany>(
      `apis/company/v4/${encodeURIComponent(id)}`,
    )
    return transformCompany(res)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).post<RawSalesmateCompany>('api/v3/companies', body)
    return transformCompany(res)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).put<RawSalesmateCompany>(
      `api/v3/companies/${id}`,
      body,
    )
    return transformCompany(res)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`api/v3/companies/${id}`)
  }

  // ── Deals ─────────────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const items = await this.searchPage<RawSalesmateDeal>(credentials, 'deal', params)
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const res = await this.client(credentials).get<RawSalesmateDeal>(
      `apis/deal/v4/${encodeURIComponent(id)}`,
    )
    return transformDeal(res)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).post<RawSalesmateDeal>('api/v3/deals', body)
    return transformDeal(res)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).put<RawSalesmateDeal>(`api/v3/deals/${id}`, body)
    return transformDeal(res)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`api/v3/deals/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  async listPipelines(_credentials: Credentials, _params: QueryParams): Promise<Pipeline[]> {
    throw notSupported(`Salesmate cannot list pipelines: ${NO_PIPELINE_ENDPOINT}`)
  }

  // ── Activities ────────────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const items = await this.searchPage<RawSalesmateActivity>(credentials, 'activity', params)
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const res = await this.client(credentials).get<RawSalesmateActivity>(
      `apis/activity/v4/${encodeURIComponent(id)}`,
    )
    return transformActivity(res)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const res = await this.client(credentials).post<RawSalesmateActivity>('api/v3/activities', body)
    return transformActivity(res)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(_credentials: Credentials, _params: QueryParams): Promise<Note[]> {
    throw notSupported(`Salesmate cannot list notes: ${NOTES_PER_RECORD_ONLY}`)
  }

  async getNote(_credentials: Credentials, _id: string): Promise<Note> {
    throw notSupported(`Salesmate cannot get a note by id alone: ${NOTES_PER_RECORD_ONLY}`)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const res = await this.client(credentials).post<RawSalesmateNote>('api/v3/notes', body)
    return transformNote(res)
  }
}
