/**
 * Vendasta CRM adapter — OpenSteward CRM vertical.
 *
 * Maps the Vendasta CRM REST API (gRPC-Gateway, all POST) to canonical CRM
 * resources: contacts, companies, deals (opportunities), and pipelines.
 *
 * Activities are listed from the CRM External API (/org) ListCrmRecords
 * endpoint, which needs the `customers` OAuth scope. Notes and activity/note
 * reads by id refuse with 501: no live documented endpoint serves them. The
 * activity/note write methods still call /v1/crm/activity/*, which the /grpc
 * spec does not document.
 *
 * All endpoints require a `namespace` (the Vendasta account group ID / AGID or PID)
 * which the caller supplies via `credentials.extra.namespace`.
 *
 * Auth: OAuth2 Authorization Code (Bearer token).
 * Docs: https://developers.vendasta.com/platform/iyzxipdhj3szx-crm-rest-ap-is
 * OpenAPI: https://github.com/vendasta/api-gateway-docs/tree/master/openapi/crm
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageLocally,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { VendastaClient, listOrgRecords } from './client'
import {
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  refreshToken as doRefreshToken,
} from './auth'
import { transformContact, untransformContact, type RawVendastaContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawVendastaCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawVendastaOpportunity } from './transform/deal'
import { transformPipeline, type RawVendastaPipeline } from './transform/pipeline'
import {
  transformActivity,
  untransformActivity,
  type RawVendastaActivity,
} from './transform/activity'
import { transformOrgActivity, type RawVendastaOrgActivity } from './transform/org-activity'
import { transformNote, untransformNote, type RawVendastaNote } from './transform/note'
import {
  VENDASTA_CRM_CONTACT_LIST,
  VENDASTA_CRM_CONTACT_GET,
  VENDASTA_CRM_CONTACT_CREATE,
  VENDASTA_CRM_CONTACT_UPDATE,
  VENDASTA_CRM_CONTACT_DELETE,
  VENDASTA_CRM_COMPANY_LIST,
  VENDASTA_CRM_COMPANY_GET,
  VENDASTA_CRM_COMPANY_CREATE,
  VENDASTA_CRM_COMPANY_UPDATE,
  VENDASTA_CRM_COMPANY_DELETE,
  VENDASTA_CRM_OPPORTUNITY_LIST,
  VENDASTA_CRM_OPPORTUNITY_GET,
  VENDASTA_CRM_OPPORTUNITY_CREATE,
  VENDASTA_CRM_OPPORTUNITY_UPDATE,
  VENDASTA_CRM_OPPORTUNITY_DELETE,
  VENDASTA_CRM_PIPELINE_LIST,
  VENDASTA_CRM_PIPELINE_GET,
  VENDASTA_CRM_ACTIVITY_LIST,
  VENDASTA_DEFAULT_PAGE_SIZE,
  DEFAULT_VENDASTA_SCOPES,
  VENDASTA_PROD_BASE_URL,
  VENDASTA_ORG_PROD_BASE_URL,
} from './constants'

/** Refuse before any request is sent. */
function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

export interface VendastaAdapterConfig {
  /** OAuth2 client ID. */
  clientId?: string
  /** OAuth2 client secret. */
  clientSecret?: string
  /** OAuth2 redirect URI. */
  redirectUri?: string
  /** OAuth scopes to request. Defaults to DEFAULT_VENDASTA_SCOPES when omitted. */
  scopes?: string[]
  /**
   * Vendasta API base URL. Defaults to the production base URL.
   * Set to VENDASTA_DEMO_BASE_URL for sandbox/demo environments.
   */
  baseUrl?: string
  /**
   * Vendasta CRM External API (/org) base URL, used for activities.
   * Defaults to VENDASTA_ORG_PROD_BASE_URL; set VENDASTA_ORG_DEMO_BASE_URL for demo.
   */
  orgBaseUrl?: string
}

export class VendastaAdapter implements CrmAdapter {
  readonly platform = 'vendasta'
  readonly version = '0.1.0'

  private clientId: string | undefined
  private clientSecret: string | undefined
  private redirectUri: string | undefined
  private scopes: string[]
  private baseUrl: string
  private orgBaseUrl: string

  constructor(config: VendastaAdapterConfig = {}) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? [...DEFAULT_VENDASTA_SCOPES]
    this.baseUrl = config.baseUrl ?? VENDASTA_PROD_BASE_URL
    this.orgBaseUrl = config.orgBaseUrl ?? VENDASTA_ORG_PROD_BASE_URL
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(
      {
        clientId: this.clientId ?? '',
        clientSecret: this.clientSecret ?? '',
        redirectUri: this.redirectUri ?? '',
        scopes: overrideScopes ?? this.scopes,
      },
      state,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Vendasta exchangeCode: clientId and clientSecret required')
    }
    return doExchangeCode(
      { clientId: this.clientId, clientSecret: this.clientSecret, redirectUri },
      code,
      redirectUri,
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) return credentials
    const clientId =
      this.clientId ?? (credentials.extra as Record<string, string> | undefined)?.['clientId'] ?? ''
    const clientSecret =
      this.clientSecret ??
      (credentials.extra as Record<string, string> | undefined)?.['clientSecret'] ??
      ''
    return doRefreshToken({ clientId, clientSecret }, credentials)
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private client(credentials: Credentials): VendastaClient {
    return new VendastaClient(credentials, this.baseUrl)
  }

  /**
   * Resolve the namespace (Vendasta account group / AGID / PID) from credentials.
   * Callers pass namespace via `credentials.extra.namespace`.
   */
  private namespace(credentials: Credentials): string {
    const extra = credentials.extra as Record<string, string> | undefined
    return extra?.['namespace'] ?? ''
  }

  private pageSize(params: QueryParams): number {
    return typeof params.limit === 'number' ? params.limit : VENDASTA_DEFAULT_PAGE_SIZE
  }

  /**
   * One caller page of a CRM object list. contact/company/opportunity list
   * page by an opaque cursor (v1ListCrmObjectsRequest.pagingOptions.cursor:
   * "Optional. An opaque token from a previous response's next_cursor to
   * retrieve the next page of results. Omit or leave empty for the first
   * page."), so the 1-based `page` is walked with pageByCursor, carrying
   * pagingMetadata.nextCursor forward while pagingMetadata.hasMore is true.
   * pageSize has no documented maximum, so none is declared.
   * https://raw.githubusercontent.com/vendasta/api-gateway-docs/master/openapi/openapi_external_docs/crm.openapi.json
   */
  private async listObjects(
    credentials: Credentials,
    params: QueryParams,
    path: string,
  ): Promise<unknown[]> {
    const namespace = this.namespace(credentials)
    const limit = this.pageSize(params)
    const client = this.client(credentials)
    const key = cursorPagerKey(connectionScope(namespace, credentials), path, { limit })
    const { items, hasMore } = await pageByCursor(key, params.page, async (cursor) => {
      const res = await client.list(path, namespace, cursor, limit)
      return { items: res.items, next: res.hasMore && res.nextCursor ? res.nextCursor : undefined }
    })
    reportUpstreamPage(params, { hasMore })
    return items
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const items = await this.listObjects(credentials, params, VENDASTA_CRM_CONTACT_LIST)
    return (items as RawVendastaContact[]).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const items = await this.client(credentials).getMulti(
      VENDASTA_CRM_CONTACT_GET,
      this.namespace(credentials),
      [id],
    )
    const raw = items[0] as RawVendastaContact | undefined
    if (!raw) throw new Error(`Vendasta contact not found: ${id}`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const fields = untransformContact(data)
    const raw = (await this.client(credentials).create(
      VENDASTA_CRM_CONTACT_CREATE,
      this.namespace(credentials),
      fields,
      data.owner_id ?? undefined,
    )) as RawVendastaContact
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const fields = untransformContact(data)
    const raw = (await this.client(credentials).update(
      VENDASTA_CRM_CONTACT_UPDATE,
      this.namespace(credentials),
      id,
      fields,
    )) as RawVendastaContact
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(
      VENDASTA_CRM_CONTACT_DELETE,
      this.namespace(credentials),
      id,
    )
  }

  // ── Companies ──────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const items = await this.listObjects(credentials, params, VENDASTA_CRM_COMPANY_LIST)
    return (items as RawVendastaCompany[]).map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const items = await this.client(credentials).getMulti(
      VENDASTA_CRM_COMPANY_GET,
      this.namespace(credentials),
      [id],
    )
    const raw = items[0] as RawVendastaCompany | undefined
    if (!raw) throw new Error(`Vendasta company not found: ${id}`)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const fields = untransformCompany(data)
    const raw = (await this.client(credentials).create(
      VENDASTA_CRM_COMPANY_CREATE,
      this.namespace(credentials),
      fields,
      data.owner_id ?? undefined,
    )) as RawVendastaCompany
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const fields = untransformCompany(data)
    const raw = (await this.client(credentials).update(
      VENDASTA_CRM_COMPANY_UPDATE,
      this.namespace(credentials),
      id,
      fields,
    )) as RawVendastaCompany
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(
      VENDASTA_CRM_COMPANY_DELETE,
      this.namespace(credentials),
      id,
    )
  }

  // ── Deals (Opportunities) ──────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const items = await this.listObjects(credentials, params, VENDASTA_CRM_OPPORTUNITY_LIST)
    return (items as RawVendastaOpportunity[]).map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const items = await this.client(credentials).getMulti(
      VENDASTA_CRM_OPPORTUNITY_GET,
      this.namespace(credentials),
      [id],
    )
    const raw = items[0] as RawVendastaOpportunity | undefined
    if (!raw) throw new Error(`Vendasta opportunity not found: ${id}`)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const fields = untransformDeal(data)
    const raw = (await this.client(credentials).create(
      VENDASTA_CRM_OPPORTUNITY_CREATE,
      this.namespace(credentials),
      fields,
      data.owner_id ?? undefined,
    )) as RawVendastaOpportunity
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const fields = untransformDeal(data)
    const raw = (await this.client(credentials).update(
      VENDASTA_CRM_OPPORTUNITY_UPDATE,
      this.namespace(credentials),
      id,
      fields,
    )) as RawVendastaOpportunity
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(
      VENDASTA_CRM_OPPORTUNITY_DELETE,
      this.namespace(credentials),
      id,
    )
  }

  // ── Pipelines (read-only) ──────────────────────────────────────────────────

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const items = (await this.client(credentials).listPipelines(
      VENDASTA_CRM_PIPELINE_LIST,
      this.namespace(credentials),
    )) as RawVendastaPipeline[]
    // pipeline/list has no paging fields and returns every pipeline, so the
    // caller's page is sliced here.
    return pageLocally(items, params).map(transformPipeline)
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const items = (await this.client(credentials).getPipelinesByIds(
      VENDASTA_CRM_PIPELINE_GET,
      this.namespace(credentials),
      [id],
    )) as RawVendastaPipeline[]
    const raw = items[0]
    if (!raw) throw new Error(`Vendasta pipeline not found: ${id}`)
    return transformPipeline(raw)
  }

  // ── Activities ─────────────────────────────────────────────────────────────

  /**
   * Activities are not on the /grpc CRM spec (it has no /v1/crm/activity/*
   * path). The CRM External API lists them: ListCrmRecords,
   * POST {org}/list/{namespace}/{resourceTypeCode} — "The resourceTypeCode,
   * here contacts, companies or activities." Paging is the body's
   * `page: {cursor, limit}`, answered by `next_cursor` / `has_more`. No
   * maximum `limit` is documented, so the caller's limit is sent as is.
   * https://raw.githubusercontent.com/vendasta/api-gateway-docs/master/openapi/crm/crm.json
   */
  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const namespace = this.namespace(credentials)
    if (!namespace) {
      throw notSupported(
        'Vendasta cannot list activities: the connection has no namespace ("The namespace, PID/AGID" is a required path parameter)',
      )
    }
    const limit = this.pageSize(params)
    const key = cursorPagerKey(connectionScope(namespace, credentials), 'org:list/activities', {
      limit,
    })
    const { items, hasMore } = await pageByCursor(key, params.page, async (cursor) => {
      const res = await listOrgRecords<RawVendastaOrgActivity>(
        credentials,
        this.orgBaseUrl,
        namespace,
        'activities',
        cursor,
        limit,
      )
      return {
        items: res.objects ?? [],
        next: res.has_more && res.next_cursor ? res.next_cursor : undefined,
      }
    })
    reportUpstreamPage(params, { hasMore })
    return items.map(transformOrgActivity)
  }

  /**
   * The /grpc spec has no activity get, and the CRM External API's
   * GetCrmRecord (GET /{namespace}/{resourceTypeCode}/{id}) is status
   * `Proposed`: "We are considering building this item and would like your
   * feedback. It can only be used with the mock server."
   */
  async getActivity(_credentials: Credentials, _id: string): Promise<Activity> {
    throw notSupported(
      'Vendasta cannot get an activity by id: GetCrmRecord is "Proposed" ("It can only be used with the mock server.") and the /grpc CRM API has no activity endpoint',
    )
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const fields = untransformActivity(data)
    const raw = (await this.client(credentials).create(
      VENDASTA_CRM_ACTIVITY_LIST.replace('/list', '/create'),
      this.namespace(credentials),
      fields,
      data.owner_id ?? undefined,
    )) as RawVendastaActivity
    return transformActivity(raw)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const fields = untransformActivity(data)
    const raw = (await this.client(credentials).update(
      VENDASTA_CRM_ACTIVITY_LIST.replace('/list', '/update'),
      this.namespace(credentials),
      id,
      fields,
    )) as RawVendastaActivity
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(
      VENDASTA_CRM_ACTIVITY_LIST.replace('/list', '/delete'),
      this.namespace(credentials),
      id,
    )
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  /**
   * Notes are an activity sub-type ("There are many sub-types such as notes,
   * meetings, calls, and tasks." — CRM-Overview.md), but ListCrmRecords takes
   * only "contacts, companies or activities" and documents no value of
   * `subtype` or of `system__activity_activity_type` ("Type of activity") that
   * selects notes. The old /grpc /v1/crm/activity/list path is not in the spec.
   */
  async listNotes(_credentials: Credentials, _params: QueryParams): Promise<Note[]> {
    throw notSupported(
      'Vendasta cannot list notes: ListCrmRecords lists "contacts, companies or activities" and documents no subtype or activity-type value that selects notes',
    )
  }

  async getNote(_credentials: Credentials, _id: string): Promise<Note> {
    throw notSupported(
      'Vendasta cannot get a note by id: GetCrmRecord is "Proposed" ("It can only be used with the mock server.") and the /grpc CRM API has no activity endpoint',
    )
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const fields = untransformNote(data)
    const raw = (await this.client(credentials).create(
      VENDASTA_CRM_ACTIVITY_LIST.replace('/list', '/create'),
      this.namespace(credentials),
      fields,
      data.owner_id ?? undefined,
    )) as RawVendastaNote
    return transformNote(raw)
  }

  async updateNote(credentials: Credentials, id: string, data: Partial<Note>): Promise<Note> {
    const fields = untransformNote(data)
    const raw = (await this.client(credentials).update(
      VENDASTA_CRM_ACTIVITY_LIST.replace('/list', '/update'),
      this.namespace(credentials),
      id,
      fields,
    )) as RawVendastaNote
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(
      VENDASTA_CRM_ACTIVITY_LIST.replace('/list', '/delete'),
      this.namespace(credentials),
      id,
    )
  }
}
