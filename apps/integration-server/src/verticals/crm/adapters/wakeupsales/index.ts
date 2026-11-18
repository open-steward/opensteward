import { simpleApiKey } from '@opensteward/shared'
/**
 * Wakeupsales adapter for the CRM vertical.
 *
 * Maps the Wakeupsales REST API to canonical CRM resources.
 * Docs: https://apidocs.wakeupsales.com/
 *
 * Auth: API key header — X-Access-Token: <api_key>
 * Base URL: https://app.wakeupsales.com/api/v1/ (TODO: verify)
 * Notable:
 *   - Simple CRM for SMBs focused on sales pipeline management, India
 *   - credentials.accessToken = api key
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (18):
 *   Contacts: list, get, create, update, delete
 *   Companies: list, get, create, update, delete
 *   Deals: list, get, create, update, delete
 *   Pipelines: list
 *   Activities: list, get, create
 *   Notes: list, get, create
 *   Webhooks: stub
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { WakeupsalesClient } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { DEFAULT_PAGE_SIZE } from './constants'
import { transformContact, untransformContact, type RawWakeupsalesContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawWakeupsalesCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawWakeupsalesDeal } from './transform/deal'
import { transformPipeline, type RawWakeupsalesPipeline } from './transform/pipeline'
import { transformActivity, untransformActivity, type RawWakeupsalesActivity } from './transform/activity'
import { transformNote, untransformNote, type RawWakeupsalesNote } from './transform/note'

export interface WakeupsalesAdapterConfig {
  apiKey?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class WakeupsalesAdapter implements CrmAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'wakeupsales'
  readonly version = '0.1.0'

  constructor(_config: WakeupsalesAdapterConfig = {}) {}

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

  private client(credentials: Credentials): WakeupsalesClient {
    return new WakeupsalesClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      per_page: Number(params['limit'] ?? DEFAULT_PAGE_SIZE),
      page: Number(params['page'] ?? 1),
    }
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    // TODO: verify endpoint path against https://apidocs.wakeupsales.com/
    const items = await this.client(credentials).list<RawWakeupsalesContact>(
      'contacts',
      this.listParams(params),
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<RawWakeupsalesContact>(`contacts/${id}`)
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).post<RawWakeupsalesContact>('contacts', body)
    return transformContact(res)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).put<RawWakeupsalesContact>(`contacts/${id}`, body)
    return transformContact(res)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`contacts/${id}`)
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    // TODO: verify endpoint path
    const items = await this.client(credentials).list<RawWakeupsalesCompany>(
      'companies',
      this.listParams(params),
    )
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const res = await this.client(credentials).get<RawWakeupsalesCompany>(`companies/${id}`)
    return transformCompany(res)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).post<RawWakeupsalesCompany>('companies', body)
    return transformCompany(res)
  }

  async updateCompany(credentials: Credentials, id: string, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).put<RawWakeupsalesCompany>(`companies/${id}`, body)
    return transformCompany(res)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`companies/${id}`)
  }

  // ── Deals ─────────────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    // TODO: verify endpoint — may be 'deals' or 'opportunities'
    const items = await this.client(credentials).list<RawWakeupsalesDeal>(
      'deals',
      this.listParams(params),
    )
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const res = await this.client(credentials).get<RawWakeupsalesDeal>(`deals/${id}`)
    return transformDeal(res)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).post<RawWakeupsalesDeal>('deals', body)
    return transformDeal(res)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).put<RawWakeupsalesDeal>(`deals/${id}`, body)
    return transformDeal(res)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`deals/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  async listPipelines(credentials: Credentials, _params: QueryParams): Promise<Pipeline[]> {
    // TODO: verify pipeline endpoint
    try {
      const items = await this.client(credentials).list<RawWakeupsalesPipeline>('pipelines')
      return items.map(transformPipeline)
    } catch (e: unknown) {
      if ((e as { statusCode?: number }).statusCode === 404) return []
      throw e
    }
  }

  // ── Activities ────────────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    // TODO: verify activities endpoint
    const items = await this.client(credentials).list<RawWakeupsalesActivity>(
      'activities',
      this.listParams(params),
    )
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const res = await this.client(credentials).get<RawWakeupsalesActivity>(`activities/${id}`)
    return transformActivity(res)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const res = await this.client(credentials).post<RawWakeupsalesActivity>('activities', body)
    return transformActivity(res)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    // TODO: verify notes endpoint
    const items = await this.client(credentials).list<RawWakeupsalesNote>(
      'notes',
      this.listParams(params),
    )
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const res = await this.client(credentials).get<RawWakeupsalesNote>(`notes/${id}`)
    return transformNote(res)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const res = await this.client(credentials).post<RawWakeupsalesNote>('notes', body)
    return transformNote(res)
  }
}
