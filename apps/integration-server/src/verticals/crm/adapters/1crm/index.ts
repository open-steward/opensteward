/**
 * 1CRM adapter — CRM resource coverage for the OpenSteward CRM vertical.
 *
 * Maps the 1CRM REST API v8.x to canonical CRM resources (contacts,
 * companies/accounts, deals/opportunities, activities/tasks, notes).
 * Pipeline data is synthesized from the known 1CRM stage enumeration.
 *
 * Auth: OAuth2 Authorization Code flow (tenant-hosted). Each 1CRM
 * deployment is self-hosted; the base URL is supplied at construction and
 * stored in credentials.extra.baseUrl after token exchange.
 *
 * Pagination: offset + limit (default 20, max 200), end from total_results.
 *
 * Docs: https://demo.1crmcloud.com/api.php
 *
 * ── Coverage ──────────────────────────────────────────────────────────────
 *
 * Implemented (22):
 *   Contacts:   list, get, create, update, delete
 *   Companies:  list, get, create, update, delete  (1CRM Account)
 *   Deals:      list, get, create, update, delete  (1CRM Opportunity)
 *   Pipelines:  list, get                          (synthetic — stage enum)
 *   Activities: list, get, create, update, delete  (1CRM Task)
 *   Notes:      list, get, create, update, delete
 *
 * Webhooks: 1CRM supports create/update webhooks via /api.php/webhooks,
 *   but does not publish a signature-verification scheme for inbound
 *   webhook deliveries. verifyWebhook / parseWebhookEvents are omitted;
 *   the registry returns HTTP 501 for those methods automatically.
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import {
  pageLocally,
  pageOffset,
  reportUpstreamPage,
  type CredentialField,
} from '@opensteward/shared'
import { OneCrmClient } from './client'
import {
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  normaliseBaseUrl,
  refreshToken as doRefreshToken,
} from './auth'
import {
  transformContact,
  untransformContact,
  type Raw1CrmContact,
} from './transform/contact'
import {
  transformCompany,
  untransformCompany,
  type Raw1CrmAccount,
} from './transform/company'
import {
  transformDeal,
  untransformDeal,
  type Raw1CrmOpportunity,
} from './transform/deal'
import {
  buildDefaultPipeline,
  getPipelineById,
} from './transform/pipeline'
import {
  transformActivity,
  untransformActivity,
  type Raw1CrmTask,
} from './transform/activity'
import {
  transformNote,
  untransformNote,
  type Raw1CrmNote,
} from './transform/note'
import {
  ONECRM_DEFAULT_LIMIT,
  ONECRM_MAX_LIMIT,
  DEFAULT_ONECRM_SCOPES,
  ONECRM_MODULE,
} from './constants'

export interface OneCrmAdapterConfig {
  /**
   * Deployment-wide 1CRM instance (e.g. https://myco.1crmcloud.com). Optional:
   * the instance normally comes from the customer at connect time
   * (`oauthFields`) and is then read back from `credentials.extra.baseUrl`.
   * There is no default instance.
   */
  baseUrl?: string
  /** OAuth2 client ID registered in 1CRM Admin > API & OAuth Settings. */
  clientId?: string
  /** OAuth2 client secret. */
  clientSecret?: string
  /** OAuth2 redirect URI. */
  redirectUri?: string
  /** OAuth scopes to request. Defaults to ['read', 'write']. */
  scopes?: string[]
}

export class OneCrmAdapter implements CrmAdapter {
  readonly platform = '1crm'
  readonly version = '0.1.0'
  /** /data/{model} limit is documented as "Int [1:200] (20)". */
  readonly capabilities = { maxPageSize: ONECRM_MAX_LIMIT }

  /** Deployment-wide fallback. Per-customer instances arrive via `oauthFields`. */
  private baseUrl: string | undefined
  private clientId: string | undefined
  private clientSecret: string | undefined
  private redirectUri: string | undefined
  private scopes: string[]

  constructor(config: OneCrmAdapterConfig = {}) {
    this.baseUrl = config.baseUrl
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? [...DEFAULT_ONECRM_SCOPES]
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  /**
   * Authorize, token and API all live under the customer's own `api.php`,
   * which deployment config cannot know. Asked for on the Connect page before
   * the redirect, then read back from `credentials.extra.baseUrl`.
   */
  oauthFields(): CredentialField[] {
    return [
      {
        name: 'baseUrl',
        label: '1CRM URL',
        type: 'url',
        required: true,
        placeholder: 'https://yourcompany.1crmcloud.com',
        helpText: 'The https:// address you use to open 1CRM.',
      },
    ]
  }

  getAuthUrl(
    state: string,
    overrideScopes?: string[],
    _codeChallenge?: string,
    inputs?: Record<string, string>,
  ): string {
    return buildAuthUrl(
      {
        baseUrl: this.resolveBaseUrl(inputs?.baseUrl),
        clientId: this.clientId ?? '',
        clientSecret: this.clientSecret ?? '',
        redirectUri: this.redirectUri ?? '',
        scopes: overrideScopes ?? this.scopes,
      },
      state,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return this.exchange(code, redirectUri, this.resolveBaseUrl())
  }

  /** Exchange on the customer's instance and remember it with the credentials. */
  async exchangeCodeWithInputs(
    code: string,
    redirectUri: string,
    inputs: Record<string, string>,
  ): Promise<Credentials> {
    return this.exchange(code, redirectUri, this.resolveBaseUrl(inputs.baseUrl))
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) return credentials
    const clientId = this.clientId ?? ''
    const clientSecret = this.clientSecret ?? ''
    return doRefreshToken(
      { baseUrl: this.storedBaseUrl(credentials), clientId, clientSecret },
      credentials,
    )
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async exchange(code: string, redirectUri: string, baseUrl: string): Promise<Credentials> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('1CRM exchangeCode: clientId and clientSecret required')
    }
    return doExchangeCode(
      {
        baseUrl,
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        redirectUri,
        scopes: this.scopes,
      },
      code,
    )
  }

  /** The customer's instance when supplied, else the deployment-wide one — normalised or a readable error. */
  private resolveBaseUrl(candidate?: string): string {
    return normaliseBaseUrl(candidate ?? this.baseUrl)
  }

  /** The instance recorded with the credentials at exchange, else the deployment-wide one. */
  private storedBaseUrl(credentials: Credentials): string | undefined {
    const stored = credentials.extra?.['baseUrl']
    return typeof stored === 'string' ? stored : this.baseUrl
  }

  private client(credentials: Credentials): OneCrmClient {
    return new OneCrmClient(credentials, normaliseBaseUrl(this.storedBaseUrl(credentials)))
  }

  /**
   * One caller page of /data/{model}: `limit` clamped to 1CRM's documented
   * 1..200, `offset` derived from the 1-based `page` at that size, and the
   * end read from `total_results` ("Total number of results, without taking
   * offset and limit in account").
   */
  private async listPage<T>(
    credentials: Credentials,
    model: string,
    params: QueryParams,
  ): Promise<T[]> {
    const requested = params.limit ?? ONECRM_DEFAULT_LIMIT
    const limit = Math.max(1, Math.min(Math.floor(requested), ONECRM_MAX_LIMIT))
    const offset = pageOffset(params, limit)
    const { items, total } = await this.client(credentials).list<T>(model, { limit, offset })
    reportUpstreamPage(params, {
      pageSize: limit,
      ...(typeof total === 'number'
        ? { totalCount: total, hasMore: offset + items.length < total }
        : {}),
    })
    return items
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const items = await this.listPage<Raw1CrmContact>(credentials, ONECRM_MODULE.CONTACT, params)
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<Raw1CrmContact>(ONECRM_MODULE.CONTACT, id)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).createAndFetch<Raw1CrmContact>(
      ONECRM_MODULE.CONTACT,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const raw = await this.client(credentials).updateAndFetch<Raw1CrmContact>(
      ONECRM_MODULE.CONTACT,
      id,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(ONECRM_MODULE.CONTACT, id)
  }

  // ── Companies (Account) ────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const items = await this.listPage<Raw1CrmAccount>(credentials, ONECRM_MODULE.ACCOUNT, params)
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<Raw1CrmAccount>(ONECRM_MODULE.ACCOUNT, id)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).createAndFetch<Raw1CrmAccount>(
      ONECRM_MODULE.ACCOUNT,
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const raw = await this.client(credentials).updateAndFetch<Raw1CrmAccount>(
      ONECRM_MODULE.ACCOUNT,
      id,
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(ONECRM_MODULE.ACCOUNT, id)
  }

  // ── Deals (Opportunity) ────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const items = await this.listPage<Raw1CrmOpportunity>(credentials, ONECRM_MODULE.OPPORTUNITY, params)
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<Raw1CrmOpportunity>(
      ONECRM_MODULE.OPPORTUNITY,
      id,
    )
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).createAndFetch<Raw1CrmOpportunity>(
      ONECRM_MODULE.OPPORTUNITY,
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async updateDeal(
    credentials: Credentials,
    id: string,
    data: Partial<Deal>,
  ): Promise<Deal> {
    const raw = await this.client(credentials).updateAndFetch<Raw1CrmOpportunity>(
      ONECRM_MODULE.OPPORTUNITY,
      id,
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(ONECRM_MODULE.OPPORTUNITY, id)
  }

  // ── Pipelines (synthetic from stage enum) ─────────────────────────────────

  async listPipelines(_credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    return pageLocally([buildDefaultPipeline()], params)
  }

  async getPipeline(_credentials: Credentials, id: string): Promise<Pipeline> {
    const pipeline = getPipelineById(id)
    if (!pipeline) {
      throw Object.assign(
        new Error(`1CRM pipeline not found: ${id}`),
        { statusCode: 404 },
      )
    }
    return pipeline
  }

  // ── Activities (Task) ──────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const items = await this.listPage<Raw1CrmTask>(credentials, ONECRM_MODULE.TASK, params)
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).get<Raw1CrmTask>(ONECRM_MODULE.TASK, id)
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const raw = await this.client(credentials).createAndFetch<Raw1CrmTask>(
      ONECRM_MODULE.TASK,
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const raw = await this.client(credentials).updateAndFetch<Raw1CrmTask>(
      ONECRM_MODULE.TASK,
      id,
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(ONECRM_MODULE.TASK, id)
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const items = await this.listPage<Raw1CrmNote>(credentials, ONECRM_MODULE.NOTE, params)
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.client(credentials).get<Raw1CrmNote>(ONECRM_MODULE.NOTE, id)
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).createAndFetch<Raw1CrmNote>(
      ONECRM_MODULE.NOTE,
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async updateNote(
    credentials: Credentials,
    id: string,
    data: Partial<Note>,
  ): Promise<Note> {
    const raw = await this.client(credentials).updateAndFetch<Raw1CrmNote>(
      ONECRM_MODULE.NOTE,
      id,
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(ONECRM_MODULE.NOTE, id)
  }
}
