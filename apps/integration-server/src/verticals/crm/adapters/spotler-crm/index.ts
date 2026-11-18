/**
 * Spotler CRM adapter for the CRM vertical.
 *
 * Maps the Spotler CRM (formerly Really Simple Systems) API v4 to canonical
 * CRM resources. Docs: https://support.reallysimplesystems.com/api-v4/
 *
 * Auth: "Authorization: Bearer {access_token}". The page mentions an OAuth
 * webflow but publishes no authorize or token URL.
 *
 * ── Reads ───────────────────────────────────────────────────────────────
 *
 *   Companies:  list, get       (GET /accounts, /accounts/{id})
 *   Contacts:   list, get       (GET /contacts, /contacts/{id})
 *   Activities: list            (GET /activities)
 *   Deals:      refused — /opportunities is documented but its fields are
 *               not, so the required Deal.title has no source
 *   Pipelines:  refused — no stages or pipelines object
 *   Notes:      refused — no notes object
 *
 * Writes are unchanged from the original adapter and were not re-verified.
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { SpotlerCrmClient } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { pageOffset, reportUpstreamPage } from '@opensteward/shared'
import { OAUTH_AUTH_URL, OAUTH_TOKEN_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { transformContact, untransformContact, type RawSpotlerContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawSpotlerCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawSpotlerDeal } from './transform/deal'
import {
  transformActivity,
  untransformActivity,
  type RawSpotlerActivity,
} from './transform/activity'
import { transformNote, untransformNote, type RawSpotlerNote } from './transform/note'

export interface SpotlerCrmAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
}

export class SpotlerCrmAdapter implements CrmAdapter {
  readonly platform = 'spotler-crm'
  readonly version = '0.1.0'
  /** "All GET requests are limited to 100 records at a time and defaulted to 10." */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private clientId: string | undefined
  private clientSecret: string | undefined
  private redirectUri: string | undefined

  constructor(config: SpotlerCrmAdapterConfig = {}) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    const url = new URL(OAUTH_AUTH_URL)
    url.searchParams.set('client_id', this.clientId ?? '')
    url.searchParams.set('redirect_uri', this.redirectUri ?? '')
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('state', state)
    return url.toString()
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('SpotlerCRM: clientId and clientSecret required')
    }
    const res = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: redirectUri,
        code,
      }).toString(),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`SpotlerCRM token exchange failed: ${text}`)
    }
    const json = (await res.json()) as {
      access_token: string
      refresh_token?: string
      expires_in?: number
    }
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : undefined,
    }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken || !this.clientId || !this.clientSecret) return credentials
    const res = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: credentials.refreshToken,
      }).toString(),
    })
    if (!res.ok) return credentials
    const json = (await res.json()) as {
      access_token: string
      refresh_token?: string
      expires_in?: number
    }
    return {
      ...credentials,
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? credentials.refreshToken,
      expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : undefined,
    }
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): SpotlerCrmClient {
    return new SpotlerCrmClient(credentials)
  }

  /**
   * The caller's page of object `path`, one upstream page per call.
   *
   * https://support.reallysimplesystems.com/api-v4/: "You can change this
   * limit by passing limit in the URL." and "GET /accounts?page=2 This will
   * return your accounts starting from the 2oth record by default. ... GET
   * /accounts?limit=100&page=4 This will return your accounts starting at the
   * 400th record." Page N starts at row N x limit, so the platform counts
   * pages from 0 and the caller's page 1 is its page 0. The end signal is the
   * documented `metadata.has_more`.
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
    const limit = Math.min(asked, MAX_PAGE_SIZE)
    const page = pageOffset(params, 1)
    const { records, hasMore } = await this.client(credentials).list<T>(path, { page, limit })
    reportUpstreamPage(params, { hasMore, ...(limit < asked ? { pageSize: limit } : {}) })
    return records
  }

  private static refuse(what: string, reason: string): never {
    throw Object.assign(new Error(`Spotler CRM cannot ${what}: ${reason}`), {
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const records = await this.listPage<RawSpotlerContact>(credentials, '/contacts', params)
    return records.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).getRecord<RawSpotlerContact>(
      `/contacts/${encodeURIComponent(id)}`,
    )
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).post<RawSpotlerContact>('/contacts', body)
    return transformContact(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).put<RawSpotlerContact>(`/contacts/${id}`, body)
    return transformContact(res)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contacts/${id}`)
  }

  // ── Companies (Accounts) ──────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const records = await this.listPage<RawSpotlerCompany>(credentials, '/accounts', params)
    return records.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const res = await this.client(credentials).getRecord<RawSpotlerCompany>(
      `/accounts/${encodeURIComponent(id)}`,
    )
    return transformCompany(res)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).post<RawSpotlerCompany>('/accounts', body)
    return transformCompany(res)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).put<RawSpotlerCompany>(`/accounts/${id}`, body)
    return transformCompany(res)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/accounts/${id}`)
  }

  // ── Deals (Opportunities) ─────────────────────────────────────────────────

  async listDeals(_credentials: Credentials, _params: QueryParams): Promise<Deal[]> {
    return SpotlerCrmAdapter.refuse(
      'list deals',
      'the API v4 page (https://support.reallysimplesystems.com/api-v4/) documents no opportunity fields, only "GET /datadictionary/{object_name}" on a live account, so the required Deal.title has no documented source',
    )
  }

  async getDeal(_credentials: Credentials, _id: string): Promise<Deal> {
    return SpotlerCrmAdapter.refuse(
      'read deals',
      'the API v4 page (https://support.reallysimplesystems.com/api-v4/) documents no opportunity fields, only "GET /datadictionary/{object_name}" on a live account, so the required Deal.title has no documented source',
    )
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).post<RawSpotlerDeal>('/opportunities', body)
    return transformDeal(res)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).put<RawSpotlerDeal>(`/opportunities/${id}`, body)
    return transformDeal(res)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/opportunities/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  async listPipelines(_credentials: Credentials, _params: QueryParams): Promise<Pipeline[]> {
    return SpotlerCrmAdapter.refuse(
      'list pipelines',
      'the API v4 record types (https://support.reallysimplesystems.com/api-v4/) are accounts, activities, contacts, campaigns, campaigndetails, campaignstages, cases, documents, opportunities, opportunityhistories and opportunity_lines; none is a pipeline or stage list, and the opportunity status field for "GET /lookup/{object_name}/{field_name}" is not named',
    )
  }

  // ── Activities ────────────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const records = await this.listPage<RawSpotlerActivity>(credentials, '/activities', params)
    return records.map(transformActivity)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const res = await this.client(credentials).post<RawSpotlerActivity>('/tasks', body)
    return transformActivity(res)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const body = untransformActivity(data)
    const res = await this.client(credentials).put<RawSpotlerActivity>(`/tasks/${id}`, body)
    return transformActivity(res)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/tasks/${id}`)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(_credentials: Credentials, _params: QueryParams): Promise<Note[]> {
    return SpotlerCrmAdapter.refuse(
      'list notes',
      'the API v4 record types (https://support.reallysimplesystems.com/api-v4/) are accounts, activities, contacts, campaigns, campaigndetails, campaignstages, cases, documents, opportunities, opportunityhistories and opportunity_lines; there is no notes object',
    )
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const res = await this.client(credentials).post<RawSpotlerNote>('/notes', body)
    return transformNote(res)
  }
}
