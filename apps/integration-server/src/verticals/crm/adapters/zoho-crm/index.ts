/**
 * Zoho CRM adapter — full CRM resource coverage for the OpenSteward CRM vertical.
 *
 * Maps the Zoho CRM REST API v8 to canonical CRM resources (contacts, accounts/companies,
 * deals, pipelines, tasks/activities, notes). Uses the module-based URL pattern
 * `/crm/v8/{Module}`. Pagination is page+per_page based. The Authorization header
 * uses the Zoho-specific `Zoho-oauthtoken` scheme (not Bearer).
 *
 * The base URL defaults to the US datacenter (`https://www.zohoapis.com/crm/v8`) but
 * can be overridden per-connection via `credentials.extra.apiBaseUrl` for other regions
 * (EU: `https://www.zohoapis.eu/crm/v8`, etc.).
 *
 * Docs: https://www.zoho.com/crm/developer/docs/api/v8/
 */

import { pageLocally } from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { ZohoCrmClient } from './client'
import { DEFAULT_ZOHO_SCOPES } from './constants'
import {
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  refreshToken as doRefreshToken,
} from './auth'
import { verifyZohoCrmWebhook, parseZohoCrmWebhookEvents } from './webhook'
import { transformContact, untransformContact, type RawZohoContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawZohoAccount } from './transform/company'
import { transformDeal, untransformDeal, type RawZohoDeal } from './transform/deal'
import { transformPipeline, type RawZohoPipeline } from './transform/pipeline'
import { transformActivity, untransformActivity, type RawZohoTask } from './transform/activity'
import { transformNote, untransformNote, type RawZohoNote } from './transform/note'

export interface ZohoCrmAdapterConfig {
  /** OAuth2 client ID. */
  clientId?: string
  /** OAuth2 client secret. */
  clientSecret?: string
  /** OAuth2 redirect URI. */
  redirectUri?: string
  /** OAuth scopes to request. Defaults to DEFAULT_ZOHO_SCOPES when omitted. */
  scopes?: string[]
}

export class ZohoCrmAdapter implements CrmAdapter {
  readonly platform = 'zoho-crm'
  readonly version = '0.1.0'

  private clientId: string | undefined
  private clientSecret: string | undefined
  private redirectUri: string | undefined
  private scopes: string[]

  constructor(config: ZohoCrmAdapterConfig = {}) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? [...DEFAULT_ZOHO_SCOPES]
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
      throw new Error('Zoho CRM exchangeCode: clientId and clientSecret required')
    }
    return doExchangeCode(
      { clientId: this.clientId, clientSecret: this.clientSecret, redirectUri },
      code,
      redirectUri,
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) return credentials
    const extra = credentials.extra as Record<string, string> | undefined
    const clientId = this.clientId ?? extra?.['clientId'] ?? ''
    const clientSecret = this.clientSecret ?? extra?.['clientSecret'] ?? ''
    return doRefreshToken({ clientId, clientSecret }, credentials)
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyZohoCrmWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseZohoCrmWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): ZohoCrmClient {
    return new ZohoCrmClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      page: params.page ?? 1,
      per_page: params.limit ?? 25,
    }
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const { items } = await this.client(credentials).list<RawZohoContact>(
      'Contacts',
      this.pageParams(params),
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawZohoContact>('Contacts', id)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).post<RawZohoContact>(
      'Contacts',
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const raw = await this.client(credentials).put<RawZohoContact>(
      'Contacts',
      id,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('Contacts', id)
  }

  // ── Companies (Accounts) ───────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const { items } = await this.client(credentials).list<RawZohoAccount>(
      'Accounts',
      this.pageParams(params),
    )
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawZohoAccount>('Accounts', id)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).post<RawZohoAccount>(
      'Accounts',
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const raw = await this.client(credentials).put<RawZohoAccount>(
      'Accounts',
      id,
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('Accounts', id)
  }

  // ── Deals ──────────────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const { items } = await this.client(credentials).list<RawZohoDeal>(
      'Deals',
      this.pageParams(params),
    )
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawZohoDeal>('Deals', id)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).post<RawZohoDeal>('Deals', untransformDeal(data))
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).put<RawZohoDeal>('Deals', id, untransformDeal(data))
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('Deals', id)
  }

  // ── Pipelines ──────────────────────────────────────────────────────────────

  /**
   * Every pipeline of the Deals module. Zoho documents pipelines only per
   * layout — "layout_id string, mandatory ... for fetching all pipelines and a
   * specific pipeline" (get-pipelines.html) — so this reads the Deals layouts
   * (layouts-meta.html, "module string, mandatory") and then each layout's
   * pipelines. Neither endpoint pages, so the rows are the whole collection.
   */
  private async allPipelines(credentials: Credentials): Promise<RawZohoPipeline[]> {
    const client = this.client(credentials)
    const layoutIds = await client.listLayoutIds('Deals')
    const rows: RawZohoPipeline[] = []
    for (const layoutId of layoutIds) {
      rows.push(...(await client.listPipelines<RawZohoPipeline>(layoutId)))
    }
    return rows
  }

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    return pageLocally((await this.allPipelines(credentials)).map(transformPipeline), params)
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const items = await this.allPipelines(credentials)
    const found = items.find((p) => String(p.id) === id)
    if (!found) {
      throw Object.assign(new Error(`Zoho CRM: pipeline ${id} not found`), { statusCode: 404 })
    }
    return transformPipeline(found)
  }

  // ── Activities (Tasks) ─────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const { items } = await this.client(credentials).list<RawZohoTask>(
      'Tasks',
      this.pageParams(params),
    )
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).get<RawZohoTask>('Tasks', id)
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const raw = await this.client(credentials).post<RawZohoTask>('Tasks', untransformActivity(data))
    return transformActivity(raw)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const raw = await this.client(credentials).put<RawZohoTask>(
      'Tasks',
      id,
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('Tasks', id)
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const { items } = await this.client(credentials).list<RawZohoNote>(
      'Notes',
      this.pageParams(params),
    )
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.client(credentials).get<RawZohoNote>('Notes', id)
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).post<RawZohoNote>('Notes', untransformNote(data))
    return transformNote(raw)
  }

  async updateNote(credentials: Credentials, id: string, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).put<RawZohoNote>('Notes', id, untransformNote(data))
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('Notes', id)
  }
}
