/**
 * Outreach adapter for the CRM vertical.
 * Docs: https://api.outreach.io/api/v2/docs
 * ── Coverage ─────────────────────────────────────────────────────────────
 * Implemented (13): listContacts, getContact, createContact, updateContact,
 *   deleteContact, listCompanies, getCompany, createCompany, updateCompany,
 *   deleteCompany, listDeals, getDeal, createDeal, updateDeal, deleteDeal,
 *   listActivities, getActivity
 * Omitted (4) — registry returns HTTP 501 automatically:
 *   listPipelines, getPipeline (no pipeline API in Outreach),
 *   createActivity/updateActivity/deleteActivity (read-only activities),
 *   listNotes, getNote, createNote, updateNote, deleteNote (no standalone notes)
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Activity } from '../../schema/activity'

import { OutreachClient } from './client'
import { exchangeCode as _exchangeCode, refreshToken as _refreshToken } from './auth'
import { verifyWebhook as _verifyWebhook, parseWebhookEvents as _parseWebhookEvents } from './webhook'
import { OAUTH_AUTH_URL, DEFAULT_PAGE_SIZE } from './constants'

import {
  transformContact,
  untransformContact,
  type RawOutreachContact,
} from './transform/contact'
import {
  transformCompany,
  untransformCompany,
  type RawOutreachCompany,
} from './transform/company'
import {
  transformDeal,
  untransformDeal,
  type RawOutreachDeal,
} from './transform/deal'
import {
  transformActivity,
  type RawOutreachActivity,
} from './transform/activity'

export interface OutreachAdapterConfig {
  /** OAuth2 client id */
  clientId?: string
  /** OAuth2 client secret */
  clientSecret?: string
  /** OAuth2 redirect URI */
  redirectUri?: string
}

export class OutreachAdapter implements CrmAdapter {
  readonly platform = 'outreach'
  readonly version = '0.1.0'

  private clientId: string | undefined
  private clientSecret: string | undefined
  private redirectUri: string | undefined

  constructor(config: OutreachAdapterConfig = {}) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    const url = new URL(OAUTH_AUTH_URL)
    url.searchParams.set('client_id', this.clientId ?? '')
    url.searchParams.set('redirect_uri', this.redirectUri ?? '')
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', (overrideScopes ?? ['accounts.all', 'prospects.all', 'opportunities.all', 'activities.all']).join(' '))
    url.searchParams.set('state', state)
    return url.toString()
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Outreach exchangeCode: clientId and clientSecret required')
    }
    return _exchangeCode(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) return credentials
    if (!this.clientId || !this.clientSecret) return credentials
    return _refreshToken(credentials, this.clientId, this.clientSecret)
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return _verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return _parseWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): OutreachClient {
    return new OutreachClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      'page[size]': params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params['page'] != null ? { 'page[number]': params['page'] } : {}),
    }
  }

  // ── Contacts (Prospects) ──────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const { items } = await this.client(credentials).list<RawOutreachContact['attributes']>(
      '/prospects',
      this.pageParams(params),
    )
    return items.map((item) => transformContact(item as unknown as RawOutreachContact))
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawOutreachContact['attributes']>(`/prospects/${id}`)
    return transformContact(raw as unknown as RawOutreachContact)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).post<RawOutreachContact['attributes']>('/prospects', body)
    return transformContact(raw as unknown as RawOutreachContact)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const body = untransformContact(data)
    // Inject id into body for PATCH
    const bodyWithId = {
      data: {
        ...(body['data'] as Record<string, unknown>),
        id,
      },
    }
    const raw = await this.client(credentials).patch<RawOutreachContact['attributes']>(
      `/prospects/${id}`,
      bodyWithId,
    )
    return transformContact(raw as unknown as RawOutreachContact)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/prospects/${id}`)
  }

  // ── Companies (Accounts) ──────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const { items } = await this.client(credentials).list<RawOutreachCompany['attributes']>(
      '/accounts',
      this.pageParams(params),
    )
    return items.map((item) => transformCompany(item as unknown as RawOutreachCompany))
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawOutreachCompany['attributes']>(`/accounts/${id}`)
    return transformCompany(raw as unknown as RawOutreachCompany)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const raw = await this.client(credentials).post<RawOutreachCompany['attributes']>('/accounts', body)
    return transformCompany(raw as unknown as RawOutreachCompany)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const body = untransformCompany(data)
    const bodyWithId = {
      data: {
        ...(body['data'] as Record<string, unknown>),
        id,
      },
    }
    const raw = await this.client(credentials).patch<RawOutreachCompany['attributes']>(
      `/accounts/${id}`,
      bodyWithId,
    )
    return transformCompany(raw as unknown as RawOutreachCompany)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/accounts/${id}`)
  }

  // ── Deals (Opportunities) ─────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const { items } = await this.client(credentials).list<RawOutreachDeal['attributes']>(
      '/opportunities',
      this.pageParams(params),
    )
    return items.map((item) => transformDeal(item as unknown as RawOutreachDeal))
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawOutreachDeal['attributes']>(`/opportunities/${id}`)
    return transformDeal(raw as unknown as RawOutreachDeal)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const raw = await this.client(credentials).post<RawOutreachDeal['attributes']>('/opportunities', body)
    return transformDeal(raw as unknown as RawOutreachDeal)
  }

  async updateDeal(
    credentials: Credentials,
    id: string,
    data: Partial<Deal>,
  ): Promise<Deal> {
    const body = untransformDeal(data)
    const bodyWithId = {
      data: {
        ...(body['data'] as Record<string, unknown>),
        id,
      },
    }
    const raw = await this.client(credentials).patch<RawOutreachDeal['attributes']>(
      `/opportunities/${id}`,
      bodyWithId,
    )
    return transformDeal(raw as unknown as RawOutreachDeal)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/opportunities/${id}`)
  }

  // ── Activities (read-only) ────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const { items } = await this.client(credentials).list<RawOutreachActivity['attributes']>(
      '/activities',
      this.pageParams(params),
    )
    return items.map((item) => transformActivity(item as unknown as RawOutreachActivity))
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).get<RawOutreachActivity['attributes']>(`/activities/${id}`)
    return transformActivity(raw as unknown as RawOutreachActivity)
  }

  // createActivity, updateActivity, deleteActivity not implemented — Outreach activities are read-only
  // listPipelines, getPipeline not implemented — Outreach has no pipeline API
  // listNotes, getNote, createNote, updateNote, deleteNote not implemented — no standalone notes resource
}
