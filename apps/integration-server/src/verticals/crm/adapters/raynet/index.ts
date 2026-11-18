import { customForm, pageLocally, pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { CredentialField } from '@opensteward/shared'
/**
 * Raynet CRM adapter for the CRM vertical.
 *
 * Maps the Raynet CRM REST API to canonical CRM resources.
 * Docs: https://app.raynetcrm.com/api/doc/index-en.html
 *
 * Auth: HTTP basic (username + API key) plus the X-Instance-Name header
 * Notable:
 *   - Czech CRM, strong in Central/Eastern Europe
 *   - camelCase field names
 *   - "contact" = individual person
 *   - "account" = company/organization
 *   - "businessCase" = deal/opportunity
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Reads (paths from the embedded OpenAPI 3.0.3 spec, 276 paths):
 *   Contacts:   GET /person/, GET /person/{personId}/
 *   Companies:  GET /company/, GET /company/{companyId}/
 *   Deals:      GET /businessCase/, GET /businessCase/{businessCaseId}/
 *   Pipelines:  GET /businessCaseType/ + GET /businessCasePhase/ (whole picklists)
 *   Activities: GET /task/, GET /task/{taskId}/
 *   Notes:      refused (501): the API has no notes resource
 *
 * Writes (create/update/delete) still target the adapter's original paths
 * and verbs, which the spec does not document; they are outside this rebuild.
 *   Webhooks: verifyWebhook (stub), parseWebhookEvents (stub)
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { RaynetClient } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { transformContact, untransformContact, type RawRaynetContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawRaynetAccount } from './transform/company'
import { transformDeal, untransformDeal, type RawRaynetBusinessCase } from './transform/deal'
import {
  transformPipelines,
  type RawRaynetBusinessCasePhase,
  type RawRaynetBusinessCaseType,
} from './transform/pipeline'
import {
  transformActivity,
  untransformActivity,
  type RawRaynetActivity,
} from './transform/activity'
import { transformNote, untransformNote, type RawRaynetNote } from './transform/note'

export interface RaynetAdapterConfig {
  apiKey?: string
}

/**
 * "Access is secured with basic authentication (username and API key) ...
 * When using basic authentication, you must also send your instance name
 * (header `X-Instance-Name`) or its ID (header `X-Instance-Id`)."
 * (https://app.raynetcrm.com/api/doc/index-en.html, Connection to RAYNET CRM)
 */
const CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'username',
    label: 'Username',
    type: 'text',
    helpText:
      "The Raynet user the API key belongs to (the `user` in the docs' `-u user:api-key` example).",
    required: true,
  },
  {
    name: 'apiKey',
    label: 'API key',
    type: 'password',
    required: true,
  },
  {
    name: 'instanceName',
    label: 'Instance name',
    type: 'text',
    helpText: 'The name of your Raynet instance, sent as the X-Instance-Name header.',
    required: true,
  },
]

const CREDENTIAL_FORM = customForm({
  fields: CREDENTIAL_FIELDS,
  async exchange(input) {
    const username = (input?.['username'] ?? '').trim()
    const apiKey = (input?.['apiKey'] ?? '').trim()
    const instanceName = (input?.['instanceName'] ?? '').trim()
    if (!username) throw new Error('Username is required.')
    if (!apiKey) throw new Error('API key is required.')
    if (!instanceName) throw new Error('Instance name is required.')
    return { accessToken: apiKey, extra: { username, instanceName } }
  },
})

/**
 * Sent on every offset/limit list. The docs state no default row order, so
 * offset paging is only stable under an explicit one: `sortColumn` (enum
 * includes "id") and `sortDirection` (enum ["ASC", "DESC"]) are documented
 * on GET /person/, /company/, /businessCase/ and /task/.
 */
const ID_ORDER = { sortColumn: 'id', sortDirection: 'ASC' } as const

/** Sent on every read: "By adding the parameter `dateFormat=ISO8601` it is possible to influence the output format". */
const DATE_FORMAT = { dateFormat: 'ISO8601' } as const

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

const NOTES_REFUSAL =
  'Raynet cannot list notes: the API has no notes resource; its only comment-like ' +
  'endpoint is GET /{entityName}/{entityId}/post/ ("list of discussion posts"), ' +
  'scoped to one record, with no lookup of a post by id'

export class RaynetAdapter implements CrmAdapter {
  // Connect Link support — username, API key and instance name.

  credentialFields = CREDENTIAL_FORM.credentialFields

  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  readonly platform = 'raynet'
  readonly version = '0.1.0'

  constructor(_config: RaynetAdapterConfig = {}) {}

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

  private client(credentials: Credentials): RaynetClient {
    return new RaynetClient(credentials)
  }

  /**
   * One caller page of an offset/limit list. "The list can be paginated by
   * setting the `offset` and `limit` parameters. Offset specifies the first
   * record to be displayed, limit specifies the number of records. The
   * maximum page size is 1 000 items." The envelope's `totalCount` is the
   * end signal.
   */
  private async listPage<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
  ): Promise<T[]> {
    const asked =
      typeof params.limit === 'number' && Number.isFinite(params.limit) && params.limit >= 1
        ? Math.floor(params.limit)
        : DEFAULT_PAGE_SIZE
    const size = Math.min(asked, MAX_PAGE_SIZE)
    const offset = pageOffset(params, size)
    const { items, totalCount } = await this.client(credentials).list<T>(path, {
      offset,
      limit: size,
      ...ID_ORDER,
      ...DATE_FORMAT,
    })
    reportUpstreamPage(params, {
      ...(totalCount !== undefined
        ? { totalCount, hasMore: offset + items.length < totalCount }
        : {}),
      ...(size < asked ? { pageSize: size } : {}),
    })
    return items
  }

  /** A picklist the API returns whole (its only documented parameter is `rowAccess`). */
  private async picklist<T>(credentials: Credentials, path: string): Promise<T[]> {
    const { items, totalCount } = await this.client(credentials).list<T>(path)
    if (totalCount !== undefined && totalCount > items.length) {
      throw Object.assign(
        new Error(`Raynet ${path} reported ${totalCount} rows but returned ${items.length}`),
        { statusCode: 502 },
      )
    }
    return items
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const items = await this.listPage<RawRaynetContact>(credentials, '/person/', params)
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<{ data: RawRaynetContact }>(
      `/person/${encodeURIComponent(id)}/`,
      DATE_FORMAT,
    )
    return transformContact(res.data)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).post<{ data: RawRaynetContact }>('/contact/', body)
    return transformContact(res.data)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).put<{ data: RawRaynetContact }>(
      `/contact/${id}/`,
      body,
    )
    return transformContact(res.data)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contact/${id}/`)
  }

  // ── Companies (Accounts) ──────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const items = await this.listPage<RawRaynetAccount>(credentials, '/company/', params)
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const res = await this.client(credentials).get<{ data: RawRaynetAccount }>(
      `/company/${encodeURIComponent(id)}/`,
      DATE_FORMAT,
    )
    return transformCompany(res.data)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).post<{ data: RawRaynetAccount }>('/account/', body)
    return transformCompany(res.data)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).put<{ data: RawRaynetAccount }>(
      `/account/${id}/`,
      body,
    )
    return transformCompany(res.data)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/account/${id}/`)
  }

  // ── Deals (Business Cases) ────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const items = await this.listPage<RawRaynetBusinessCase>(credentials, '/businessCase/', params)
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const res = await this.client(credentials).get<{ data: RawRaynetBusinessCase }>(
      `/businessCase/${encodeURIComponent(id)}/`,
      DATE_FORMAT,
    )
    return transformDeal(res.data)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).post<{ data: RawRaynetBusinessCase }>(
      '/businessCase/',
      body,
    )
    return transformDeal(res.data)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).put<{ data: RawRaynetBusinessCase }>(
      `/businessCase/${id}/`,
      body,
    )
    return transformDeal(res.data)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/businessCase/${id}/`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  /**
   * Raynet has no pipeline resource. Its deal types (GET /businessCaseType/,
   * "list of deal types") each carry their own stages (GET /businessCasePhase/,
   * "list of deal stages", each row naming its `businessCaseTypeId`), and a
   * deal names both its `businessCaseType` and its `businessCasePhase`. So
   * a pipeline is a deal type with its phases. Neither picklist documents
   * paging, so both are fetched whole and the caller's page is cut locally.
   */
  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const [types, phases] = await Promise.all([
      this.picklist<RawRaynetBusinessCaseType>(credentials, '/businessCaseType/'),
      this.picklist<RawRaynetBusinessCasePhase>(credentials, '/businessCasePhase/'),
    ])
    return pageLocally(transformPipelines(types, phases), params)
  }

  // ── Activities ────────────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const items = await this.listPage<RawRaynetActivity>(credentials, '/task/', params)
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const res = await this.client(credentials).get<{ data: RawRaynetActivity }>(
      `/task/${encodeURIComponent(id)}/`,
      DATE_FORMAT,
    )
    return transformActivity(res.data)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const res = await this.client(credentials).post<{ data: RawRaynetActivity }>('/task/', body)
    return transformActivity(res.data)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(_credentials: Credentials, _params: QueryParams): Promise<Note[]> {
    throw notSupported(NOTES_REFUSAL)
  }

  async getNote(_credentials: Credentials, _id: string): Promise<Note> {
    throw notSupported(NOTES_REFUSAL.replace('cannot list notes', 'cannot read a note by id'))
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const res = await this.client(credentials).post<{ data: RawRaynetNote }>('/note/', body)
    return transformNote(res.data)
  }
}
