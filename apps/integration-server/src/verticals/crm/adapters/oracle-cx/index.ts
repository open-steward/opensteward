/**
 * Oracle CX Sales adapter.
 *
 * Maps the Oracle CX Sales REST API (OData-like) to canonical CRM resources.
 * Auth is instance-specific OAuth2: the instance URL is stored in
 * `credentials.extra.instanceUrl`; `client_id` / `client_secret` come from
 * `credentials.extra` or adapter config.
 *
 * Docs: https://docs.oracle.com/en/cloud/saas/sales/24b/farfa/
 *
 * Coverage:
 *   - Contacts  (GET/POST/GET/:id/PATCH/:id/DELETE/:id /contacts)
 *   - Companies (GET/POST/GET/:id/PATCH/:id/DELETE/:id /accounts)
 *   - Deals     (POST/GET/:id/PATCH/:id/DELETE/:id /opportunities; listDeals
 *                refuses: the collection is filtered by default, see below)
 *   - Pipelines (synthesised — Oracle CX has no pipeline API)
 *   - Activities (GET/POST/GET/:id/PATCH/:id/DELETE/:id /activities)
 *   - Notes     (no top-level collection: listNotes/getNote refuse; see below)
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { pageOffset, reportUpstreamPage } from '@opensteward/shared'
import { OracleCxClient } from './client'
import { DEFAULT_LIMIT, MAX_LIMIT } from './constants'
import {
  buildAuthUrl,
  exchangeCode as oauthExchangeCode,
  refreshCredentials as oauthRefresh,
} from './auth'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import {
  CONTACT_FIELDS,
  transformContact,
  untransformContact,
  type RawOracleCxContact,
} from './transform/contact'
import {
  COMPANY_FIELDS,
  transformCompany,
  untransformCompany,
  type RawOracleCxCompany,
} from './transform/company'
import { DEAL_FIELDS, transformDeal, untransformDeal, type RawOracleCxDeal } from './transform/deal'
import { buildSyntheticPipelines, buildSyntheticPipeline } from './transform/pipeline'
import {
  ACTIVITY_FIELDS,
  transformActivity,
  untransformActivity,
  type RawOracleCxActivity,
} from './transform/activity'
import { transformNote, untransformNote, type RawOracleCxNote } from './transform/note'

function notesUnsupported(op: 'list' | 'get'): Error {
  return Object.assign(
    new Error(
      `Oracle CX cannot ${op} notes: the REST API has no top-level notes resource; notes are documented only as child collections of a parent record ("/crmRestApi/resources/11.13.18.05/accounts/{PartyNumber}/child/Note")`,
    ),
    { statusCode: 501, code: 'NOT_SUPPORTED' },
  )
}

export interface OracleCxAdapterConfig {
  /** OAuth2 client id. */
  clientId?: string
  /** OAuth2 client secret. */
  clientSecret?: string
  /** OAuth2 redirect URI. */
  redirectUri?: string
}

export class OracleCxAdapter implements CrmAdapter {
  readonly platform = 'oracle-cx'
  readonly version = '0.1.0'

  private clientId: string | undefined
  private clientSecret: string | undefined
  private redirectUri: string | undefined

  constructor(config: OracleCxAdapterConfig = {}) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, _overrideScopes?: string[]): string {
    // Oracle CX's per-customer instance URL would normally come from
    // pre-saved per-tenant config; the standard `getAuthUrl(state)` shape
    // doesn't have access to credentials. Falls back to instance fields.
    return buildAuthUrl('', this.clientId ?? '', this.redirectUri ?? '', state)
  }

  async exchangeCode(
    code: string,
    redirectUri: string,
    credentials?: Credentials,
  ): Promise<Credentials> {
    const instanceUrl = (credentials?.extra?.['instanceUrl'] as string | undefined) ?? ''
    const clientId = (credentials?.extra?.['clientId'] as string | undefined) ?? this.clientId ?? ''
    const clientSecret =
      (credentials?.extra?.['clientSecret'] as string | undefined) ?? this.clientSecret ?? ''
    return oauthExchangeCode(instanceUrl, { clientId, clientSecret, redirectUri }, code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    const instanceUrl = (credentials.extra?.['instanceUrl'] as string | undefined) ?? ''
    const clientId = (credentials.extra?.['clientId'] as string | undefined) ?? this.clientId ?? ''
    const clientSecret =
      (credentials.extra?.['clientSecret'] as string | undefined) ?? this.clientSecret ?? ''
    return oauthRefresh(instanceUrl, { clientId, clientSecret }, credentials)
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): OracleCxClient {
    return new OracleCxClient(credentials)
  }

  /**
   * One record by the integer id a list method returns. The documented item
   * paths are keyed by PartyNumber / OptyNumber / ActivityNumber
   * (op-contacts-partynumber-get.html: "get /crmRestApi/resources/11.13.18.05/contacts/{PartyNumber}"),
   * so the read-back filters the collection with `q=<Key>=<id>` on the
   * documented queryable key. Keys are integers ("PartyId; integer"), so any
   * other id is a 404 without a request.
   */
  private async getByKey<T>(
    credentials: Credentials,
    path: string,
    key: string,
    id: string,
    fields: string,
    what: string,
  ): Promise<T> {
    const found = /^-?\d+$/.test(id)
      ? await this.client(credentials).findByKey<T>(path, key, id, fields)
      : undefined
    if (found === undefined) {
      throw Object.assign(new Error(`Oracle CX: ${what} '${id}' not found`), { statusCode: 404 })
    }
    return found
  }

  /**
   * One caller page of an offset collection. Oracle documents `limit` ("restricts
   * the number of resources returned"), `offset` ("the starting position of the
   * resource collection ... Default value is 0") and the response's `hasMore`
   * ("Indicates whether more resources are available on the server than the
   * subset returned in the response"). The upstream cap is "500 rows or a
   * similar value", so a larger caller page is read in consecutive slices from
   * its own offset, advancing by the rows actually returned in case the server
   * cap is lower than 500.
   */
  private async listOffsetPage<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    orderBy: string,
    fields: string,
  ): Promise<T[]> {
    const want = params.limit ?? DEFAULT_LIMIT
    let offset = pageOffset(params, want)
    const client = this.client(credentials)
    const items: T[] = []
    let hasMore: boolean | undefined
    while (items.length < want) {
      const page = await client.listPage<T>(path, {
        limit: Math.min(want - items.length, MAX_LIMIT),
        offset,
        orderBy,
        fields,
      })
      items.push(...page.items)
      offset += page.items.length
      hasMore = page.hasMore
      if (hasMore !== true || page.items.length === 0) break
    }
    if (hasMore !== undefined) reportUpstreamPage(params, { hasMore })
    return items
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const items = await this.listOffsetPage<RawOracleCxContact>(
      credentials,
      '/contacts',
      params,
      'PartyId:asc',
      CONTACT_FIELDS,
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.getByKey<RawOracleCxContact>(
      credentials,
      '/contacts',
      'PartyId',
      id,
      CONTACT_FIELDS,
      'contact',
    )
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).post<RawOracleCxContact>(
      '/contacts',
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const raw = await this.client(credentials).patch<RawOracleCxContact>(
      `/contacts/${id}`,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contacts/${id}`)
  }

  // ── Companies (Accounts) ──────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const items = await this.listOffsetPage<RawOracleCxCompany>(
      credentials,
      '/accounts',
      params,
      'PartyId:asc',
      COMPANY_FIELDS,
    )
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.getByKey<RawOracleCxCompany>(
      credentials,
      '/accounts',
      'PartyId',
      id,
      COMPANY_FIELDS,
      'account',
    )
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).post<RawOracleCxCompany>(
      '/accounts',
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const raw = await this.client(credentials).patch<RawOracleCxCompany>(
      `/accounts/${id}`,
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/accounts/${id}`)
  }

  // ── Deals (Opportunities) ─────────────────────────────────────────────────

  /**
   * Refused before any request. op-opportunities-get.html: "By default, the
   * method returns the list of all opportunities filtered by the following
   * criteria: The method returns only open opportunities (Status = OPEN). The
   * method returns opportunities only for the currently logged in user
   * (MYOPTIES recordset filter is applied). The current closed period is
   * considered. ... The default value is the current fiscal quarter." The only
   * documented way to widen it is MyOpportunitiesFinder, whose OptyStatusCode
   * (default "OPEN") and EffectiveBeginDate / EffectiveEndDate (default "Based
   * on the profile option MOO_OPTY_SRCH_DFLT_CLS_PERIOD") binds document no
   * value that clears them. Serving that subset would tell a sync the deals
   * collection is complete and let it drop closed deals and other users' deals.
   */
  async listDeals(_credentials: Credentials, _params: QueryParams): Promise<Deal[]> {
    throw Object.assign(
      new Error(
        'Oracle CX cannot list deals: GET /opportunities "returns only open opportunities (Status = OPEN)", "only for the currently logged in user (MYOPTIES recordset filter is applied)" and only for "the current fiscal quarter" by default, and the docs give no way to clear those filters',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  /**
   * By the documented key finder, not the default-filtered collection:
   * "PrimaryKey: Finds an opportunity by the primary key opportunity ID.
   * Finder Variables: OptyId; integer" (op-opportunities-get.html). A closed
   * deal or another user's deal is outside the collection's default filter, so
   * a `q` read-back would miss it.
   */
  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const found = /^-?\d+$/.test(id)
      ? await this.client(credentials).findByFinder<RawOracleCxDeal>(
          '/opportunities',
          'PrimaryKey',
          'OptyId',
          id,
          DEAL_FIELDS,
        )
      : undefined
    if (found === undefined) {
      throw Object.assign(new Error(`Oracle CX: opportunity '${id}' not found`), {
        statusCode: 404,
      })
    }
    return transformDeal(found)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).post<RawOracleCxDeal>(
      '/opportunities',
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).patch<RawOracleCxDeal>(
      `/opportunities/${id}`,
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/opportunities/${id}`)
  }

  // ── Pipelines (synthesised) ───────────────────────────────────────────────

  async listPipelines(_credentials: Credentials, _params: QueryParams): Promise<Pipeline[]> {
    return buildSyntheticPipelines()
  }

  async getPipeline(_credentials: Credentials, id: string): Promise<Pipeline> {
    const pipeline = buildSyntheticPipeline()
    if (id !== pipeline.id) {
      throw Object.assign(new Error(`Oracle CX: pipeline '${id}' not found`), { statusCode: 404 })
    }
    return pipeline
  }

  // ── Activities ────────────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const items = await this.listOffsetPage<RawOracleCxActivity>(
      credentials,
      '/activities',
      params,
      'ActivityId:asc',
      ACTIVITY_FIELDS,
    )
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.getByKey<RawOracleCxActivity>(
      credentials,
      '/activities',
      'ActivityId',
      id,
      ACTIVITY_FIELDS,
      'activity',
    )
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const raw = await this.client(credentials).post<RawOracleCxActivity>(
      '/activities',
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const raw = await this.client(credentials).patch<RawOracleCxActivity>(
      `/activities/${id}`,
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/activities/${id}`)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  /**
   * The REST API for Sales and Fusion Service has no top-level notes
   * collection: its openapi.json (https://docs.oracle.com/en/cloud/saas/sales/faaps/openapi.json)
   * has no `/notes` path, op-notes-get.html is a 404, and notes are documented
   * only as child collections of one parent record, e.g.
   * "/crmRestApi/resources/11.13.18.05/accounts/{PartyNumber}/child/Note"
   * (op-accounts-partynumber-child-note-get.html).
   */
  async listNotes(_credentials: Credentials, _params: QueryParams): Promise<Note[]> {
    throw notesUnsupported('list')
  }

  async getNote(_credentials: Credentials, _id: string): Promise<Note> {
    throw notesUnsupported('get')
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).post<RawOracleCxNote>(
      '/notes',
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async updateNote(credentials: Credentials, id: string, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).patch<RawOracleCxNote>(
      `/notes/${id}`,
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/notes/${id}`)
  }
}
