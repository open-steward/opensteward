/**
 * Pega CRM adapter — CRM resource coverage for the OpenSteward CRM vertical.
 *
 * Maps the Pega Platform REST API (v1) and Pega Sales Automation data pages
 * to canonical CRM resources: contacts, companies (accounts), deals
 * (opportunities), activities (tasks), and notes (interactions).
 *
 * Pipelines are not implemented — Pega stages are configuration-defined and
 * not exposed as a REST-queryable resource. Those methods auto-501.
 *
 * Authentication: OAuth2 Authorization Code grant. The tenant base URL must
 * be supplied in the adapter config; it is also stored in credentials.extra
 * after the first code exchange so the refresh path is self-contained.
 *
 * Docs:
 *   https://github.com/pegasystems/pega-api (RAML spec)
 *   https://docs.pega.com/bundle/platform/page/platform/security/configure-oauth-2-client-registration.html
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: pipeline — Pega Sales Automation stages are configuration-defined
//   rule sets, not a REST-queryable resource. The Pega API v1 RAML spec
//   (github.com/pegasystems/pega-api) exposes no /pipelines or /stages
//   endpoint; stages live in the Pega rule repository and cannot be listed
//   via the standard prweb/api/v1 surface.

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import type { CredentialField } from '@opensteward/shared'
import { PegaCrmClient } from './client'
import {
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  normaliseBaseUrl,
  refreshToken as doRefreshToken,
} from './auth'
import {
  transformContact,
  untransformContact,
  type RawPegaContact,
} from './transform/contact'
import {
  transformCompany,
  untransformCompany,
  type RawPegaAccount,
} from './transform/company'
import {
  transformDeal,
  untransformDeal,
  type RawPegaOpportunity,
} from './transform/deal'
import {
  transformActivity,
  untransformActivity,
  type RawPegaTask,
} from './transform/activity'
import {
  transformNote,
  untransformNote,
  type RawPegaNote,
} from './transform/note'
import {
  PEGA_DATA_PAGE_CONTACTS,
  PEGA_DATA_PAGE_ACCOUNTS,
  PEGA_DATA_PAGE_LEADS,
  PEGA_DATA_PAGE_CONTACT_DETAIL,
  PEGA_DATA_PAGE_ACCOUNT_DETAIL,
  PEGA_DATA_PAGE_LEAD_DETAIL,
  PEGA_OPPORTUNITY_CASE_TYPE,
  PEGA_ACTIVITY_CASE_TYPE,
  DEFAULT_PEGA_SCOPES,
  PEGA_DEFAULT_PAGE_SIZE,
} from './constants'

export interface PegaCrmAdapterConfig {
  /**
   * Tenant base URL, e.g. https://acme.pegacloud.io
   * Required for all API calls. Also stored in credentials.extra after OAuth.
   */
  baseUrl?: string
  /** OAuth2 client ID from the Pega OAuth 2.0 Client Registration. */
  clientId?: string
  /** OAuth2 client secret from the Pega OAuth 2.0 Client Registration. */
  clientSecret?: string
  /** OAuth2 redirect URI. */
  redirectUri?: string
  /** OAuth scopes to request. Defaults to DEFAULT_PEGA_SCOPES when omitted. */
  scopes?: string[]
}

export class PegaCrmAdapter implements CrmAdapter {
  readonly platform = 'pega-crm'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true }

  /** Deployment-wide fallback. Per-customer hosts arrive via `oauthFields`. */
  private baseUrl: string | undefined
  private clientId: string | undefined
  private clientSecret: string | undefined
  private redirectUri: string | undefined
  private scopes: string[]

  constructor(config: PegaCrmAdapterConfig = {}) {
    this.baseUrl = config.baseUrl
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? [...DEFAULT_PEGA_SCOPES]
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  /**
   * Authorize, token and API all live under the customer's own `/prweb`, which
   * deployment config cannot know. Asked for on the Connect page before the
   * redirect, then read back from `credentials.extra.baseUrl`.
   */
  oauthFields(): CredentialField[] {
    return [
      {
        name: 'baseUrl',
        label: 'Pega URL',
        type: 'url',
        required: true,
        placeholder: 'https://acme.pegacloud.io',
        helpText: 'The https:// address of your Pega server, without /prweb.',
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

  /** Exchange on the customer's host and remember it with the credentials. */
  async exchangeCodeWithInputs(
    code: string,
    redirectUri: string,
    inputs: Record<string, string>,
  ): Promise<Credentials> {
    return this.exchange(code, redirectUri, this.resolveBaseUrl(inputs.baseUrl))
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) return credentials
    const extra = credentials.extra ?? {}
    const clientId =
      this.clientId ?? (typeof extra['clientId'] === 'string' ? extra['clientId'] : '')
    const clientSecret =
      this.clientSecret ?? (typeof extra['clientSecret'] === 'string' ? extra['clientSecret'] : '')
    return doRefreshToken(
      { baseUrl: this.storedBaseUrl(credentials), clientId, clientSecret },
      credentials,
    )
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async exchange(code: string, redirectUri: string, baseUrl: string): Promise<Credentials> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Pega CRM exchangeCode: clientId and clientSecret are required')
    }
    return doExchangeCode(
      {
        baseUrl,
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        redirectUri,
      },
      code,
      redirectUri,
    )
  }

  /** The customer's host when supplied, else the deployment-wide one — normalised or a readable error. */
  private resolveBaseUrl(candidate?: string): string {
    return normaliseBaseUrl(candidate ?? this.baseUrl)
  }

  /** The host recorded with the credentials at exchange, else the deployment-wide one. */
  private storedBaseUrl(credentials: Credentials): string | undefined {
    const stored = credentials.extra?.['baseUrl']
    return typeof stored === 'string' ? stored : this.baseUrl
  }

  private client(credentials: Credentials): PegaCrmClient {
    return new PegaCrmClient(credentials, normaliseBaseUrl(this.storedBaseUrl(credentials)))
  }

  private pageParams(params: QueryParams): { pageNumber: number; pageSize: number } {
    return {
      pageNumber: Math.max(1, params.page ?? 1),
      pageSize: params.limit ?? PEGA_DEFAULT_PAGE_SIZE,
    }
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const { pageNumber, pageSize } = this.pageParams(params)
    const { items } = await this.client(credentials).listDataPage<RawPegaContact>(
      PEGA_DATA_PAGE_CONTACTS,
      pageNumber,
      pageSize,
      params.search ? { ContFilter: params.search } : {},
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).getDataPage<RawPegaContact>(
      PEGA_DATA_PAGE_CONTACT_DETAIL,
      { pyGUID: id },
    )
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    // Contacts in Pega are work objects; create as a case or via data create.
    // We use the /cases endpoint with the appropriate class.
    const body = {
      caseTypeID: 'PegaCRM-Entity-Contact',
      ...untransformContact(data),
    }
    const raw = await this.client(credentials).createCase<RawPegaContact>(body)
    return transformContact(raw)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).updateCase<RawPegaContact>(id, body)
    return transformContact(raw)
  }

  // ── Companies (Accounts) ───────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const { pageNumber, pageSize } = this.pageParams(params)
    const { items } = await this.client(credentials).listDataPage<RawPegaAccount>(
      PEGA_DATA_PAGE_ACCOUNTS,
      pageNumber,
      pageSize,
      params.search ? { AcctFilter: params.search } : {},
    )
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).getDataPage<RawPegaAccount>(
      PEGA_DATA_PAGE_ACCOUNT_DETAIL,
      { pyGUID: id },
    )
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = {
      caseTypeID: 'PegaCRM-Entity-Account',
      ...untransformCompany(data),
    }
    const raw = await this.client(credentials).createCase<RawPegaAccount>(body)
    return transformCompany(raw)
  }

  async updateCompany(credentials: Credentials, id: string, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const raw = await this.client(credentials).updateCase<RawPegaAccount>(id, body)
    return transformCompany(raw)
  }

  // ── Deals (Opportunities) ──────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const { pageNumber, pageSize } = this.pageParams(params)
    const { items } = await this.client(credentials).listCases<RawPegaOpportunity>({
      caseTypeID: PEGA_OPPORTUNITY_CASE_TYPE,
      pageNumber,
      pageSize,
    })
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).getCase<RawPegaOpportunity>(id)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = {
      caseTypeID: PEGA_OPPORTUNITY_CASE_TYPE,
      ...untransformDeal(data),
    }
    const raw = await this.client(credentials).createCase<RawPegaOpportunity>(body)
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const raw = await this.client(credentials).updateCase<RawPegaOpportunity>(id, body)
    return transformDeal(raw)
  }

  // ── Activities (Tasks) ─────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const { pageNumber, pageSize } = this.pageParams(params)
    const { items } = await this.client(credentials).listCases<RawPegaTask>({
      caseTypeID: PEGA_ACTIVITY_CASE_TYPE,
      pageNumber,
      pageSize,
    })
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).getCase<RawPegaTask>(id)
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = {
      caseTypeID: PEGA_ACTIVITY_CASE_TYPE,
      ...untransformActivity(data),
    }
    const raw = await this.client(credentials).createCase<RawPegaTask>(body)
    return transformActivity(raw)
  }

  async updateActivity(credentials: Credentials, id: string, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const raw = await this.client(credentials).updateCase<RawPegaTask>(id, body)
    return transformActivity(raw)
  }

  // ── Notes (Interactions) ───────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const { pageNumber, pageSize } = this.pageParams(params)
    // Notes in Pega are stored as Interaction cases or via data pages
    const { items } = await this.client(credentials).listCases<RawPegaNote>({
      caseTypeID: 'PegaCRM-Work-Interaction',
      pageNumber,
      pageSize,
    })
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.client(credentials).getCase<RawPegaNote>(id)
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = {
      caseTypeID: 'PegaCRM-Work-Interaction',
      ...untransformNote(data),
    }
    const raw = await this.client(credentials).createCase<RawPegaNote>(body)
    return transformNote(raw)
  }

  async updateNote(credentials: Credentials, id: string, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const raw = await this.client(credentials).updateCase<RawPegaNote>(id, body)
    return transformNote(raw)
  }

  // ── Leads — mapped as Contacts (Pega uses a unified Contact/Lead model) ────

  /**
   * List leads from the Pega Sales Automation lead data page.
   * In Pega's data model, Leads share the contact schema; they are
   * distinguished by IsCustomer=false. This mirrors the canonical Contact.
   */
  async listLeads(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const { pageNumber, pageSize } = this.pageParams(params)
    const { items } = await this.client(credentials).listDataPage<RawPegaContact>(
      PEGA_DATA_PAGE_LEADS,
      pageNumber,
      pageSize,
      params.search ? { ContFilter: params.search } : {},
    )
    return items.map(transformContact)
  }

  async getLead(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).getDataPage<RawPegaContact>(
      PEGA_DATA_PAGE_LEAD_DETAIL,
      { pyGUID: id },
    )
    return transformContact(raw)
  }
}
