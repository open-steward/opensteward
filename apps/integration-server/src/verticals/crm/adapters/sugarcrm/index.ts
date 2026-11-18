/**
 * SugarCRM adapter — maps SugarCRM REST API v11.1 to canonical CRM resources.
 *
 * Instance URL is per customer (e.g. `https://acme.sugarondemand.com`). Sugar's
 * token endpoint grants only `password` and `refresh_token`, so a connection
 * is a login collected through `credentialFields`; the instance is stored in
 * `credentials.extra.instanceUrl` for refresh and every API call.
 *
 * Resource coverage:
 *   - Contacts  (full CRUD)
 *   - Companies / Accounts  (full CRUD)
 *   - Deals / Opportunities  (full CRUD)
 *   - Pipelines  (list + get — synthesised from sales_stage enum)
 *   - Activities / Tasks  (full CRUD)
 *   - Notes  (full CRUD)
 *
 * Docs: https://support.sugarcrm.com/Documentation/Sugar_Developer/Sugar_Developer_Guide/Integration/Web_Services/REST_API/v11/
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
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
import { SugarCrmClient } from './client'
import {
  DEFAULT_MAX_NUM,
  CONTACTS_FIELDS,
  ACCOUNTS_FIELDS,
  OPPORTUNITIES_FIELDS,
  TASKS_FIELDS,
  NOTES_FIELDS,
} from './constants'
import {
  exchangePassword,
  refreshToken as doRefreshToken,
  SUGAR_CREDENTIAL_FIELDS,
  SUGAR_NO_AUTHORIZATION_CODE_FLOW,
} from './auth'
import { verifySugarWebhook, parseSugarWebhookEvents } from './webhook'

import {
  transformContact,
  untransformContact,
  type RawSugarContact,
} from './transform/contact'
import {
  transformCompany,
  untransformCompany,
  type RawSugarAccount,
} from './transform/company'
import {
  transformDeal,
  untransformDeal,
  type RawSugarOpportunity,
} from './transform/deal'
import {
  transformPipeline,
  type RawSugarSalesStageEnum,
} from './transform/pipeline'
import {
  transformActivity,
  untransformActivity,
  type RawSugarTask,
} from './transform/activity'
import {
  transformNote,
  untransformNote,
  type RawSugarNote,
} from './transform/note'

export interface SugarCrmAdapterConfig {
  /** OAuth2 client id. */
  clientId?: string
  /** OAuth2 client secret. */
  clientSecret?: string
  /** OAuth2 redirect URI. */
  redirectUri?: string
  /**
   * Default instance URL used when building the auth URL before credentials
   * exist. After token exchange the per-credential instanceUrl takes over.
   */
  instanceUrl?: string
}

export class SugarCrmAdapter implements CrmAdapter {
  readonly platform = 'sugarcrm'
  readonly version = '0.1.0'

  private clientId: string | undefined
  private clientSecret: string | undefined
  /** Deployment-wide fallback. Per-customer instances arrive via `credentialFields`. */
  private instanceUrl: string | undefined

  constructor(config: SugarCrmAdapterConfig = {}) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.instanceUrl = config.instanceUrl
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  /**
   * SugarCRM's token endpoint grants `password` and `refresh_token` only (see
   * ./auth), so the Connect page collects the instance and a login; there is
   * no authorization-code redirect to start.
   */
  credentialFields(): CredentialField[] {
    return SUGAR_CREDENTIAL_FIELDS
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangePassword(fields)
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error(SUGAR_NO_AUTHORIZATION_CODE_FLOW)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(SUGAR_NO_AUTHORIZATION_CODE_FLOW)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefreshToken(
      {
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        instanceUrl: this.instanceUrl,
      },
      credentials,
    )
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifySugarWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseSugarWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): SugarCrmClient {
    return new SugarCrmClient(credentials)
  }

  /**
   * One caller page of a /<module> GET list. Sugar pages by `offset` ("The
   * number of records to skip over before records are returned") and
   * `max_num` ("A maximum number of records to return"), and marks the end
   * with `next_offset` ("-1 will be returned when there are no more
   * records"). No maximum for `max_num` is documented, so the caller's limit
   * is sent as is.
   */
  private async listPage<T>(
    credentials: Credentials,
    module: string,
    fields: string,
    params: QueryParams,
  ): Promise<T[]> {
    const size = Math.max(1, Math.floor(params.limit ?? DEFAULT_MAX_NUM))
    const { items, nextOffset } = await this.client(credentials).list<T>(module, fields, {
      max_num: size,
      offset: pageOffset(params, size),
    })
    reportUpstreamPage(params, {
      pageSize: size,
      ...(typeof nextOffset === 'number' ? { hasMore: nextOffset !== -1 } : {}),
    })
    return items
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const items = await this.listPage<RawSugarContact>(credentials, 'Contacts', CONTACTS_FIELDS, params)
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawSugarContact>('Contacts', id, CONTACTS_FIELDS)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).post<RawSugarContact>(
      'Contacts',
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).put<RawSugarContact>(
      'Contacts',
      id,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('Contacts', id)
  }

  // ── Companies (Accounts) ─────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const items = await this.listPage<RawSugarAccount>(credentials, 'Accounts', ACCOUNTS_FIELDS, params)
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawSugarAccount>('Accounts', id, ACCOUNTS_FIELDS)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).post<RawSugarAccount>(
      'Accounts',
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async updateCompany(credentials: Credentials, id: string, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).put<RawSugarAccount>(
      'Accounts',
      id,
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('Accounts', id)
  }

  // ── Deals (Opportunities) ─────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const items = await this.listPage<RawSugarOpportunity>(credentials, 'Opportunities', OPPORTUNITIES_FIELDS, params)
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawSugarOpportunity>(
      'Opportunities',
      id,
      OPPORTUNITIES_FIELDS,
    )
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).post<RawSugarOpportunity>(
      'Opportunities',
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).put<RawSugarOpportunity>(
      'Opportunities',
      id,
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('Opportunities', id)
  }

  // ── Pipelines (synthesised from sales_stage enum) ─────────────────────────

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const raw = await this.client(credentials).getEnum<RawSugarSalesStageEnum>(
      'Opportunities',
      'sales_stage',
    )
    // The enum endpoint "does not accept any request arguments" and returns the
    // whole list, from which one pipeline is synthesised: page it locally.
    return pageLocally([transformPipeline(raw)], params)
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    if (id !== 'default') {
      throw Object.assign(
        new Error(`SugarCRM: pipeline '${id}' not found — only 'default' exists`),
        { statusCode: 404 },
      )
    }
    const raw = await this.client(credentials).getEnum<RawSugarSalesStageEnum>(
      'Opportunities',
      'sales_stage',
    )
    return transformPipeline(raw)
  }

  // ── Activities (Tasks) ────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const items = await this.listPage<RawSugarTask>(credentials, 'Tasks', TASKS_FIELDS, params)
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).get<RawSugarTask>('Tasks', id, TASKS_FIELDS)
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    if (!body.name) body.name = 'Task'
    const raw = await this.client(credentials).post<RawSugarTask>('Tasks', body)
    return transformActivity(raw)
  }

  async updateActivity(credentials: Credentials, id: string, data: Partial<Activity>): Promise<Activity> {
    const raw = await this.client(credentials).put<RawSugarTask>(
      'Tasks',
      id,
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('Tasks', id)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const items = await this.listPage<RawSugarNote>(credentials, 'Notes', NOTES_FIELDS, params)
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.client(credentials).get<RawSugarNote>('Notes', id, NOTES_FIELDS)
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    if (!body.name) body.name = 'Note'
    const raw = await this.client(credentials).post<RawSugarNote>('Notes', body)
    return transformNote(raw)
  }

  async updateNote(credentials: Credentials, id: string, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).put<RawSugarNote>(
      'Notes',
      id,
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('Notes', id)
  }
}
