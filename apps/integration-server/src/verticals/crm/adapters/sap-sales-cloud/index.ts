/**
 * SAP Sales Cloud V2 adapter — CRM vertical.
 *
 * Maps SAP Sales Cloud Version 2 REST APIs to OpenSteward canonical CRM
 * resources: contacts (individuals), companies (accounts), deals
 * (opportunities), pipelines (sales phases), activities, and notes.
 *
 * Auth: technical user. V2 has no browser OAuth authorization-code endpoint;
 * HTTP Basic to the tenant's iam-service mints a short-lived bearer token (see
 * ./auth). Tenant-specific endpoints:
 *   token:   https://<tenant>.crm.cloud.sap/sap/c4c/api/v1/iam-service/token
 *   api:     https://<tenant>.crm.cloud.sap/sap/c4c/api/v1/...
 *
 * Pagination: $top / $skip query params; OData V4-style `value` array
 * response with optional `@odata.nextLink`.
 *
 * Docs: https://api.sap.com/package/SAPSalesServiceCloudV2/rest
 */

import type { CredentialField } from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { SapSalesCloudClient } from './client'
import {
  exchangeTechnicalUser,
  normaliseTenantUrl,
  refreshTechnicalUser,
  SAP_CREDENTIAL_FIELDS,
  SAP_NO_AUTHORIZATION_CODE_FLOW,
} from './auth'
import {
  transformContact,
  untransformContact,
  type RawSapIndividual,
} from './transform/contact'
import {
  transformCompany,
  untransformCompany,
  type RawSapAccount,
} from './transform/company'
import {
  transformDeal,
  untransformDeal,
  type RawSapOpportunity,
} from './transform/deal'
import {
  transformPipelineFromPhases,
  type RawSapSalesPhase,
} from './transform/pipeline'
import {
  transformActivity,
  untransformActivity,
  type RawSapActivity,
} from './transform/activity'
import {
  transformNote,
  untransformNote,
  type RawSapNote,
} from './transform/note'
import {
  SAP_INDIVIDUAL_PATH,
  SAP_ACCOUNT_PATH,
  SAP_OPPORTUNITY_PATH,
  SAP_TASK_PATH,
  SAP_NOTE_SUFFIX,
  SAP_SALES_PHASE_PATH,
  SAP_DEFAULT_PAGE_SIZE,
} from './constants'

export interface SapSalesCloudAdapterConfig {
  /**
   * Tenant base URL, e.g. https://myXXXXXX.crm.cloud.sap
   * Required for all API calls and OAuth redirects.
   */
  tenantUrl?: string
  /** OAuth2 client ID. */
  clientId?: string
  /** OAuth2 client secret. */
  clientSecret?: string
  /** OAuth2 redirect URI. */
  redirectUri?: string
  /** OAuth scopes to request. Defaults to DEFAULT_SAP_SCOPES when omitted. */
  scopes?: string[]
}

export class SapSalesCloudAdapter implements CrmAdapter {
  readonly platform = 'sap-sales-cloud'
  readonly version = '0.1.0'

  /** Deployment-wide fallback tenant. Per-customer tenants arrive via `credentialFields`. */
  private tenantUrl: string | undefined

  constructor(config: SapSalesCloudAdapterConfig = {}) {
    this.tenantUrl = config.tenantUrl
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  /**
   * SAP Sales Cloud Version 2 authenticates API clients as a technical user
   * (see ./auth). The tenant, user and password are collected on the Connect
   * page; there is no authorization-code redirect to start.
   */
  credentialFields(): CredentialField[] {
    return SAP_CREDENTIAL_FIELDS
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangeTechnicalUser(fields)
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error(SAP_NO_AUTHORIZATION_CODE_FLOW)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(SAP_NO_AUTHORIZATION_CODE_FLOW)
  }

  /** Tokens last about an hour with no refresh token: mint a new one with the stored technical user. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshTechnicalUser(credentials)
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private client(credentials: Credentials): SapSalesCloudClient {
    // The bearer token is sent to this host, so the stored tenant is re-validated.
    const stored = credentials.extra?.['tenantUrl']
    return new SapSalesCloudClient(
      normaliseTenantUrl(typeof stored === 'string' ? stored : this.tenantUrl),
      credentials,
    )
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      $top: params.limit ?? SAP_DEFAULT_PAGE_SIZE,
    }
    if (params['skip'] != null) out.$skip = params['skip']
    if (params['$skip'] != null) out.$skip = params['$skip']
    return out
  }

  // ── Contacts (Individuals) ─────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const { items } = await this.client(credentials).list<RawSapIndividual>(
      SAP_INDIVIDUAL_PATH,
      this.pageParams(params),
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawSapIndividual>(
      `${SAP_INDIVIDUAL_PATH}/${id}`,
    )
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).post<RawSapIndividual>(
      SAP_INDIVIDUAL_PATH,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const raw = await this.client(credentials).patch<RawSapIndividual>(
      `${SAP_INDIVIDUAL_PATH}/${id}`,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`${SAP_INDIVIDUAL_PATH}/${id}`)
  }

  // ── Companies (Accounts) ───────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const { items } = await this.client(credentials).list<RawSapAccount>(
      SAP_ACCOUNT_PATH,
      this.pageParams(params),
    )
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawSapAccount>(
      `${SAP_ACCOUNT_PATH}/${id}`,
    )
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).post<RawSapAccount>(
      SAP_ACCOUNT_PATH,
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const raw = await this.client(credentials).patch<RawSapAccount>(
      `${SAP_ACCOUNT_PATH}/${id}`,
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`${SAP_ACCOUNT_PATH}/${id}`)
  }

  // ── Deals (Opportunities) ──────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const { items } = await this.client(credentials).list<RawSapOpportunity>(
      SAP_OPPORTUNITY_PATH,
      this.pageParams(params),
    )
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawSapOpportunity>(
      `${SAP_OPPORTUNITY_PATH}/${id}`,
    )
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).post<RawSapOpportunity>(
      SAP_OPPORTUNITY_PATH,
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async updateDeal(
    credentials: Credentials,
    id: string,
    data: Partial<Deal>,
  ): Promise<Deal> {
    const raw = await this.client(credentials).patch<RawSapOpportunity>(
      `${SAP_OPPORTUNITY_PATH}/${id}`,
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`${SAP_OPPORTUNITY_PATH}/${id}`)
  }

  // ── Pipelines (Sales Phases) ───────────────────────────────────────────────

  async listPipelines(credentials: Credentials, _params: QueryParams): Promise<Pipeline[]> {
    const { items } = await this.client(credentials).list<RawSapSalesPhase>(
      SAP_SALES_PHASE_PATH,
    )
    if (items.length === 0) return []
    return [transformPipelineFromPhases(items)]
  }

  async getPipeline(credentials: Credentials, _id: string): Promise<Pipeline> {
    // SAP has a single global phase list; always return the synthetic pipeline.
    const { items } = await this.client(credentials).list<RawSapSalesPhase>(
      SAP_SALES_PHASE_PATH,
    )
    return transformPipelineFromPhases(items)
  }

  // ── Activities (Tasks) ─────────────────────────────────────────────────────
  //
  // SAP Sales Cloud V2 does NOT expose "activity-service/activities".
  // Activities are split into task-service/tasks and
  // appointment-service/appointments.  This adapter maps the canonical
  // Activity interface to Tasks (SalesSvcCloudV2_taskService).

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const { items } = await this.client(credentials).list<RawSapActivity>(
      SAP_TASK_PATH,
      this.pageParams(params),
    )
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).get<RawSapActivity>(
      `${SAP_TASK_PATH}/${id}`,
    )
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const raw = await this.client(credentials).post<RawSapActivity>(
      SAP_TASK_PATH,
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const raw = await this.client(credentials).patch<RawSapActivity>(
      `${SAP_TASK_PATH}/${id}`,
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`${SAP_TASK_PATH}/${id}`)
  }

  // ── Notes ──────────────────────────────────────────────────────────────────
  //
  // SAP Sales Cloud V2 does NOT provide a flat "note-service/notes" collection.
  // Notes are sub-resources on parent objects:
  //   /opportunity-service/opportunities/{id}/notes
  //   /account-service/accounts/{id}/notes
  //
  // When a deal_id is present in the data/params the opportunity parent is used.
  // For flat list operations, notes are fetched via the opportunity parent whose
  // id is supplied in params['deal_id'] or params['opportunityId'].
  // If no parent id is available we fall back to the first-page opportunity list
  // and return an empty set (SAP does not support cross-parent note queries).

  /** Resolve the parent notes URL for a given note payload / context. */
  private noteParentPath(data: Partial<Note>): string {
    if (data.deal_id) {
      return `${SAP_OPPORTUNITY_PATH}/${data.deal_id}${SAP_NOTE_SUFFIX}`
    }
    if (data.company_id) {
      return `${SAP_ACCOUNT_PATH}/${data.company_id}${SAP_NOTE_SUFFIX}`
    }
    // Default to opportunity parent; callers should supply deal_id.
    return `${SAP_OPPORTUNITY_PATH}${SAP_NOTE_SUFFIX}`
  }

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    // Use deal_id from params when available to scope the notes query.
    const dealId = params['deal_id'] as string | undefined
      ?? params['opportunityId'] as string | undefined
    const basePath = dealId
      ? `${SAP_OPPORTUNITY_PATH}/${dealId}${SAP_NOTE_SUFFIX}`
      : `${SAP_OPPORTUNITY_PATH}${SAP_NOTE_SUFFIX}`
    const { items } = await this.client(credentials).list<RawSapNote>(
      basePath,
      this.pageParams(params),
    )
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    // A standalone note GET requires the parent context; SAP may support
    // direct GET by note id under the opportunity sub-collection.
    const raw = await this.client(credentials).get<RawSapNote>(
      `${SAP_OPPORTUNITY_PATH}${SAP_NOTE_SUFFIX}/${id}`,
    )
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).post<RawSapNote>(
      this.noteParentPath(data),
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async updateNote(
    credentials: Credentials,
    id: string,
    data: Partial<Note>,
  ): Promise<Note> {
    const raw = await this.client(credentials).patch<RawSapNote>(
      `${this.noteParentPath(data)}/${id}`,
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(
      `${SAP_OPPORTUNITY_PATH}${SAP_NOTE_SUFFIX}/${id}`,
    )
  }
}
