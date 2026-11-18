/**
 * Accelo adapter — CRM resource coverage for the OpenSteward CRM vertical.
 *
 * Maps the Accelo API v0 to canonical CRM resources: contacts, companies,
 * deals (called "prospects" in Accelo), activities, notes, and pipelines.
 *
 * Accelo does not have an explicit "pipeline" entity. Pipelines are derived
 * from prospect types (GET /prospects/types), with stages sourced from the
 * global prospect statuses (GET /prospects/statuses).
 *
 * Each Accelo tenant has its own deployment subdomain. The customer supplies it
 * on the Connect page (`oauthFields`); it is persisted in
 * `credentials.extra.deployment` at token exchange and used for refresh and
 * every API call.
 *
 * Docs: https://api.accelo.com/docs/
 */

// ── Resource coverage ──────────────────────────────────────────────
// All 6 CRM resources are covered:
//   contact, company, deal, activity, note — native endpoints
//   pipeline — derived: prospect types as pipelines, prospect statuses as stages

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import type { CredentialField } from '@opensteward/shared'
import { AcceloClient } from './client'
import {
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  normaliseDeployment,
  refreshToken as doRefreshToken,
} from './auth'
import { verifyAcceloWebhook, parseAcceloWebhookEvents } from './webhook'
import {
  transformContact, untransformContact, type RawAcceloContact,
} from './transform/contact'
import {
  transformCompany, untransformCompany, type RawAcceloCompany,
} from './transform/company'
import {
  transformDeal, untransformDeal, type RawAcceloProspect,
} from './transform/deal'
import {
  transformActivity, untransformActivity, type RawAcceloActivity,
} from './transform/activity'
import {
  transformNote, untransformNote, type RawAcceloNote,
} from './transform/note'
import {
  transformPipeline, type RawAcceloProspectType, type RawAcceloProspectStatus,
} from './transform/pipeline'
import {
  ACCELO_CONTACT_FIELDS,
  ACCELO_COMPANY_FIELDS,
  ACCELO_PROSPECT_FIELDS,
  ACCELO_ACTIVITY_FIELDS,
  DEFAULT_ACCELO_SCOPES,
} from './constants'

export interface AcceloAdapterConfig {
  /**
   * Accelo deployment subdomain, e.g. "mycompany" for mycompany.api.accelo.com.
   * Required — the OAuth2 endpoints are per-deployment.
   */
  deployment?: string
  /** OAuth2 client ID. */
  clientId?: string
  /** OAuth2 client secret. */
  clientSecret?: string
  /** OAuth2 redirect URI. */
  redirectUri?: string
  /** OAuth scopes to request. Defaults to DEFAULT_ACCELO_SCOPES when omitted. */
  scopes?: string[]
}

export class AcceloAdapter implements CrmAdapter {
  readonly platform = 'accelo'
  readonly version = '0.1.0'

  /** Deployment-wide fallback. Per-customer deployments arrive via `oauthFields`. */
  private deployment: string | undefined
  private clientId: string | undefined
  private clientSecret: string | undefined
  private redirectUri: string | undefined
  private scopes: string[]

  constructor(config: AcceloAdapterConfig = {}) {
    this.deployment = config.deployment
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? [...DEFAULT_ACCELO_SCOPES]
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  /**
   * Authorize, token and API endpoints all live on the customer's deployment
   * host, which deployment config cannot know. Asked for on the Connect page
   * before the redirect, then read back from `credentials.extra.deployment`.
   */
  oauthFields(): CredentialField[] {
    return [
      {
        name: 'deployment',
        label: 'Accelo deployment',
        type: 'text',
        required: true,
        placeholder: 'mycompany',
        helpText: 'Your Accelo address without .accelo.com — mycompany for mycompany.accelo.com.',
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
        deployment: this.resolveDeployment(inputs?.deployment),
        clientId: this.clientId ?? '',
        clientSecret: this.clientSecret ?? '',
        redirectUri: this.redirectUri ?? '',
        scopes: overrideScopes ?? this.scopes,
      },
      state,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return this.exchange(code, redirectUri, this.resolveDeployment())
  }

  /** Exchange on the customer's deployment and remember it with the credentials. */
  async exchangeCodeWithInputs(
    code: string,
    redirectUri: string,
    inputs: Record<string, string>,
  ): Promise<Credentials> {
    return this.exchange(code, redirectUri, this.resolveDeployment(inputs.deployment))
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) return credentials
    const stored = credentials.extra?.['deployment']
    const deployment = this.resolveDeployment(typeof stored === 'string' ? stored : undefined)
    const clientId = this.clientId ?? ''
    const clientSecret = this.clientSecret ?? ''
    return doRefreshToken({ deployment, clientId, clientSecret }, credentials)
  }

  private async exchange(code: string, redirectUri: string, deployment: string): Promise<Credentials> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('AcceloAdapter exchangeCode: clientId and clientSecret required')
    }
    return doExchangeCode(
      {
        deployment,
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        redirectUri,
      },
      code,
      redirectUri,
    )
  }

  /**
   * The customer's deployment when one was supplied, else the deployment-wide
   * default — normalised, or a readable error instead of a hostless URL.
   */
  private resolveDeployment(candidate?: string): string {
    return normaliseDeployment(candidate ?? this.deployment)
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyAcceloWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseAcceloWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): AcceloClient {
    return new AcceloClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      _limit: params.limit ?? 25,
    }
    if (params['page'] != null) out._page = params['page']
    if (params['_page'] != null) out._page = params['_page']
    return out
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const { items } = await this.client(credentials).list<RawAcceloContact>(
      '/contacts',
      { ...this.pageParams(params), _fields: ACCELO_CONTACT_FIELDS },
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawAcceloContact>(
      `/contacts/${id}`,
      { _fields: ACCELO_CONTACT_FIELDS },
    )
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).post<RawAcceloContact>(
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
    const raw = await this.client(credentials).put<RawAcceloContact>(
      `/contacts/${id}`,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contacts/${id}`)
  }

  // ── Companies ──────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const { items } = await this.client(credentials).list<RawAcceloCompany>(
      '/companies',
      { ...this.pageParams(params), _fields: ACCELO_COMPANY_FIELDS },
    )
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawAcceloCompany>(
      `/companies/${id}`,
      { _fields: ACCELO_COMPANY_FIELDS },
    )
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).post<RawAcceloCompany>(
      '/companies',
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const raw = await this.client(credentials).put<RawAcceloCompany>(
      `/companies/${id}`,
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/companies/${id}`)
  }

  // ── Deals (Prospects) ──────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const { items } = await this.client(credentials).list<RawAcceloProspect>(
      '/prospects',
      { ...this.pageParams(params), _fields: ACCELO_PROSPECT_FIELDS },
    )
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawAcceloProspect>(
      `/prospects/${id}`,
      { _fields: ACCELO_PROSPECT_FIELDS },
    )
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).post<RawAcceloProspect>(
      '/prospects',
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async updateDeal(
    credentials: Credentials,
    id: string,
    data: Partial<Deal>,
  ): Promise<Deal> {
    const raw = await this.client(credentials).put<RawAcceloProspect>(
      `/prospects/${id}`,
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/prospects/${id}`)
  }

  // ── Pipelines (derived: prospect types + statuses) ─────────────────────────
  //
  // Accelo models pipelines as "prospect types". Stages are derived from the
  // global "prospect statuses" endpoint (GET /prospects/statuses). Both lists
  // are fetched in parallel and composed into canonical Pipeline objects.

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const [typesResult, statusesResult] = await Promise.all([
      this.client(credentials).list<RawAcceloProspectType>(
        '/prospects/types',
        { ...this.pageParams(params), _fields: 'id,title,standing,ordering' },
      ),
      this.client(credentials).list<RawAcceloProspectStatus>(
        '/prospects/statuses',
        { _limit: 100, _fields: 'id,title,standing,ordering' },
      ),
    ])
    const statuses = statusesResult.items
    return typesResult.items.map((t) => transformPipeline(t, statuses))
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const [raw, statusesResult] = await Promise.all([
      this.client(credentials).get<RawAcceloProspectType>(
        `/prospects/types/${id}`,
        { _fields: 'id,title,standing,ordering' },
      ),
      this.client(credentials).list<RawAcceloProspectStatus>(
        '/prospects/statuses',
        { _limit: 100, _fields: 'id,title,standing,ordering' },
      ),
    ])
    return transformPipeline(raw, statusesResult.items)
  }

  // ── Activities ─────────────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const { items } = await this.client(credentials).list<RawAcceloActivity>(
      '/activities',
      { ...this.pageParams(params), _fields: ACCELO_ACTIVITY_FIELDS },
    )
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).get<RawAcceloActivity>(
      `/activities/${id}`,
      { _fields: ACCELO_ACTIVITY_FIELDS },
    )
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const raw = await this.client(credentials).post<RawAcceloActivity>(
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
    const raw = await this.client(credentials).put<RawAcceloActivity>(
      `/activities/${id}`,
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/activities/${id}`)
  }

  // ── Notes ──────────────────────────────────────────────────────────────────
  //
  // Accelo notes are activities with medium = "note". We create them via
  // POST /activities and list by filtering on medium.

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const { items } = await this.client(credentials).list<RawAcceloNote>(
      '/activities',
      {
        ...this.pageParams(params),
        _fields: 'id,body,owner_id,against_type,against_id,date_created,date_modified',
        '_filters': 'medium(Note)',
      },
    )
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.client(credentials).get<RawAcceloNote>(
      `/activities/${id}`,
      { _fields: 'id,body,owner_id,against_type,against_id,date_created,date_modified' },
    )
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).post<RawAcceloNote>(
      '/activities',
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async updateNote(
    credentials: Credentials,
    id: string,
    data: Partial<Note>,
  ): Promise<Note> {
    const raw = await this.client(credentials).put<RawAcceloNote>(
      `/activities/${id}`,
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/activities/${id}`)
  }
}
