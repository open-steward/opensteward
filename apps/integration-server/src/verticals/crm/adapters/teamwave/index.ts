import { simpleApiKey } from '@opensteward/shared'
/**
 * Teamwave adapter for the CRM vertical.
 *
 * Teamwave is an all-in-one business suite (CRM, project management, HRMS).
 * This adapter targets its CRM module, which exposes a conventional REST API
 * with contacts, organizations (companies), deals, pipelines, activities,
 * and notes.
 *
 * **Coverage** — full across all 6 canonical resources:
 * - Contacts:   list, get, create, update, delete  ✓
 * - Companies:  list, get, create, update, delete  ✓  (organizations endpoint)
 * - Deals:      list, get, create, update, delete  ✓
 * - Pipelines:  list, get                          ✓
 * - Activities: list, get, create, update, delete  ✓
 * - Notes:      list, get, create, delete          ✓
 *
 * **Auth**: API key sent as `Token {apiKey}` in the Authorization header.
 * `exchangeCode` stores the raw API key as `credentials.accessToken`.
 *
 * **Pagination**: Teamwave uses `page` + `per_page` query params and returns
 * `{ data: [...], meta: { total_pages, current_page } }`.
 *
 * Docs: https://www.teamwave.com/api/
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { TeamwaveClient } from './client'
import { verifyTeamwaveWebhook, parseTeamwaveWebhookEvents } from './webhook'
import { transformContact, untransformContact, type RawTeamwaveContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawTeamwaveOrganization } from './transform/company'
import { transformDeal, untransformDeal, type RawTeamwaveDeal } from './transform/deal'
import { transformPipeline, type RawTeamwavePipeline } from './transform/pipeline'
import { transformActivity, untransformActivity, type RawTeamwaveActivity } from './transform/activity'
import { transformNote, untransformNote, type RawTeamwaveNote } from './transform/note'

export interface TeamwaveAdapterConfig {
  /**
   * Teamwave API key. Stored directly as `credentials.accessToken` and sent
   * as `Token {apiKey}` in the Authorization header.
   */
  apiKey?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class TeamwaveAdapter implements CrmAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'teamwave'
  readonly version = '0.1.0'

  private apiKey: string | undefined

  constructor(config: TeamwaveAdapterConfig = {}) {
    this.apiKey = config.apiKey
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Teamwave uses API-key auth, not OAuth2
    return 'https://app.teamwave.com/settings/api'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return { accessToken: this.apiKey ?? _code }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys do not expire
    return credentials
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyTeamwaveWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseTeamwaveWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): TeamwaveClient {
    const effective: Credentials = this.apiKey
      ? { accessToken: this.apiKey }
      : credentials
    return new TeamwaveClient(effective)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      page: params['page'] ?? 1,
      limit: params['limit'] ?? 25,
    }
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const { items } = await this.client(credentials).list<RawTeamwaveContact>(
      '/contacts',
      this.listParams(params),
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawTeamwaveContact>(`/contacts/${id}`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).post<RawTeamwaveContact>(
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
    const raw = await this.client(credentials).put<RawTeamwaveContact>(
      `/contacts/${id}`,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contacts/${id}`)
  }

  // ── Companies (Organizations) ─────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const { items } = await this.client(credentials).list<RawTeamwaveOrganization>(
      '/organizations',
      this.listParams(params),
    )
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawTeamwaveOrganization>(`/organizations/${id}`)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).post<RawTeamwaveOrganization>(
      '/organizations',
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const raw = await this.client(credentials).put<RawTeamwaveOrganization>(
      `/organizations/${id}`,
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/organizations/${id}`)
  }

  // ── Deals ─────────────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const { items } = await this.client(credentials).list<RawTeamwaveDeal>(
      '/deals',
      this.listParams(params),
    )
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawTeamwaveDeal>(`/deals/${id}`)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).post<RawTeamwaveDeal>(
      '/deals',
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async updateDeal(
    credentials: Credentials,
    id: string,
    data: Partial<Deal>,
  ): Promise<Deal> {
    const raw = await this.client(credentials).put<RawTeamwaveDeal>(
      `/deals/${id}`,
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/deals/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const { items } = await this.client(credentials).list<RawTeamwavePipeline>(
      '/pipelines',
      this.listParams(params),
    )
    return items.map(transformPipeline)
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const raw = await this.client(credentials).get<RawTeamwavePipeline>(`/pipelines/${id}`)
    return transformPipeline(raw)
  }

  // ── Activities ────────────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const { items } = await this.client(credentials).list<RawTeamwaveActivity>(
      '/activities',
      this.listParams(params),
    )
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).get<RawTeamwaveActivity>(`/activities/${id}`)
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const raw = await this.client(credentials).post<RawTeamwaveActivity>(
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
    const raw = await this.client(credentials).put<RawTeamwaveActivity>(
      `/activities/${id}`,
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/activities/${id}`)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const { items } = await this.client(credentials).list<RawTeamwaveNote>(
      '/notes',
      this.listParams(params),
    )
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.client(credentials).get<RawTeamwaveNote>(`/notes/${id}`)
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).post<RawTeamwaveNote>(
      '/notes',
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/notes/${id}`)
  }
}
