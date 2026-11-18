/**
 * BoondManager adapter for the CRM vertical.
 *
 * Maps the BoondManager REST API (JSON:API) to canonical CRM resources.
 * Docs: https://doc.boondmanager.com/api-externe/
 * Base URL: https://ui.boondmanager.com/api
 *
 * ── Auth ──────────────────────────────────────────────────────────────────
 *   JWT token sent in the `X-Jwt-Client-Boondmanager` header on every request.
 *   credentials.accessToken = pre-built JWT (userToken + clientToken signed
 *   with clientKey using HS256) — or a Basic-Auth base64 string when
 *   credentials.extra.authType === 'basic'.
 *
 *   The Connect Link form collects the JWT token directly (simpleApiKey).
 *
 * ── Response format ───────────────────────────────────────────────────────
 *   JSON:API: { data: [{ id, type, attributes, relationships }], meta }
 *   Pagination: `page` (1-indexed) + `maxResults` query params.
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (11):
 *   Contacts:  list, get, create, update, delete
 *   Companies: list, get, create, update, delete
 *   Deals (opportunities): list, get, create, update, delete
 *   Activities (actions):  list, get, create, update, delete
 *
 * Omitted — registry returns HTTP 501 automatically:
 *   Notes — no standalone /notes endpoint; notes are embedded in actions
 *   Pipelines — not exposed via the public REST API
 *
 * ── Resource coverage ──────────────────────────────────────────────────
 * Unavailable: pipeline — BoondManager has no /pipelines or /stages REST
 *   endpoint; opportunity progression is a flat integer state enum (AO_ETAT)
 *   with no configurable named-stage pipeline resource in the public API.
 *   The "pipeline_commercial" workflow tool is a date-range reporting
 *   aggregation, not a pipeline configuration resource.
 */

import { customForm } from '@opensteward/shared'
import type { CredentialField } from '@opensteward/shared'

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Activity } from '../../schema/activity'

import { BoondManagerClient, buildJsonApiBody } from './client'
import { DEFAULT_PAGE_SIZE, PATHS } from './constants'
import {
  transformContact,
  untransformContact,
  type RawBoondManagerContact,
} from './transform/contact'
import {
  transformCompany,
  untransformCompany,
  type RawBoondManagerCompany,
} from './transform/company'
import {
  transformDeal,
  untransformDeal,
  type RawBoondManagerOpportunity,
} from './transform/deal'
import {
  transformActivity,
  untransformActivity,
  type RawBoondManagerAction,
} from './transform/activity'

// ── Credential form ────────────────────────────────────────────────────────
// BoondManager uses a JWT token (not a plain API key) sent in a custom header.
// We use customForm so we can surface a clear label in the Connect Link UI.

const CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'apiKey',
    label: 'JWT Token',
    type: 'password',
    placeholder: 'eyJhbGciOiJIUzI1NiJ9...',
    helpText:
      'Your BoondManager JWT token (X-Jwt-Client-Boondmanager). ' +
      'Build it from userToken + clientToken + clientKey via the BoondManager developer portal.',
    required: true,
  },
]

const CREDENTIAL_FORM = customForm({
  fields: CREDENTIAL_FIELDS,
  exchange(input) {
    const token = (input?.['apiKey'] ?? '').trim()
    if (!token) throw new Error('JWT Token is required.')
    return Promise.resolve({ accessToken: token })
  },
})

// ── Adapter ────────────────────────────────────────────────────────────────

export class BoondmanagerAdapter implements CrmAdapter {
  readonly platform = 'boondmanager'
  readonly version = '0.1.0'

  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  // ── Auth ─────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // BoondManager uses JWT, not OAuth2.
    return ''
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    // Not applicable — JWT-only.
    throw new Error('BoondManager does not support OAuth2 code exchange.')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // JWT tokens do not expire via a refresh flow; return as-is.
    return credentials
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private client(credentials: Credentials): BoondManagerClient {
    return new BoondManagerClient(credentials)
  }

  private pageParams(params: QueryParams): { page: number; maxResults: number } {
    return {
      page: Math.max(1, Number(params['page'] ?? 1)),
      maxResults: Math.max(1, Number(params.limit ?? DEFAULT_PAGE_SIZE)),
    }
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const { page, maxResults } = this.pageParams(params)
    const res = await this.client(credentials).list(PATHS.contacts, page, maxResults)
    return (res.data ?? []).map(item => transformContact(item as RawBoondManagerContact))
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get(`${PATHS.contacts}/${id}`)
    if (!res.data) {
      throw Object.assign(new Error(`BoondManager: contact ${id} not found`), { statusCode: 404 })
    }
    return transformContact(res.data as RawBoondManagerContact)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const attributes = untransformContact(data)
    const relationships: Record<string, unknown> = {}
    if (data.company_id) {
      relationships['company'] = { data: { id: data.company_id, type: 'company' } }
    }
    const body = buildJsonApiBody('contact', attributes, undefined, relationships)
    const res = await this.client(credentials).post(PATHS.contacts, body)
    return transformContact(res.data as RawBoondManagerContact)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const attributes = untransformContact(data)
    const body = buildJsonApiBody('contact', attributes, id)
    const res = await this.client(credentials).put(`${PATHS.contacts}/${id}`, body)
    return transformContact(res.data as RawBoondManagerContact)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`${PATHS.contacts}/${id}`)
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const { page, maxResults } = this.pageParams(params)
    const res = await this.client(credentials).list(PATHS.companies, page, maxResults)
    return (res.data ?? []).map(item => transformCompany(item as RawBoondManagerCompany))
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const res = await this.client(credentials).get(`${PATHS.companies}/${id}`)
    if (!res.data) {
      throw Object.assign(new Error(`BoondManager: company ${id} not found`), { statusCode: 404 })
    }
    return transformCompany(res.data as RawBoondManagerCompany)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const attributes = untransformCompany(data)
    const body = buildJsonApiBody('company', attributes)
    const res = await this.client(credentials).post(PATHS.companies, body)
    return transformCompany(res.data as RawBoondManagerCompany)
  }

  async updateCompany(credentials: Credentials, id: string, data: Partial<Company>): Promise<Company> {
    const attributes = untransformCompany(data)
    const body = buildJsonApiBody('company', attributes, id)
    const res = await this.client(credentials).put(`${PATHS.companies}/${id}`, body)
    return transformCompany(res.data as RawBoondManagerCompany)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`${PATHS.companies}/${id}`)
  }

  // ── Deals (Opportunities) ─────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const { page, maxResults } = this.pageParams(params)
    const res = await this.client(credentials).list(PATHS.opportunities, page, maxResults)
    return (res.data ?? []).map(item => transformDeal(item as RawBoondManagerOpportunity))
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const res = await this.client(credentials).get(`${PATHS.opportunities}/${id}`)
    if (!res.data) {
      throw Object.assign(new Error(`BoondManager: opportunity ${id} not found`), { statusCode: 404 })
    }
    return transformDeal(res.data as RawBoondManagerOpportunity)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const attributes = untransformDeal(data)
    const relationships: Record<string, unknown> = {}
    if (data.company_id) {
      relationships['company'] = { data: { id: data.company_id, type: 'company' } }
    }
    if (data.contact_ids?.[0]) {
      relationships['contact'] = { data: { id: data.contact_ids[0], type: 'contact' } }
    }
    const body = buildJsonApiBody('opportunity', attributes, undefined, relationships)
    const res = await this.client(credentials).post(PATHS.opportunities, body)
    return transformDeal(res.data as RawBoondManagerOpportunity)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const attributes = untransformDeal(data)
    const body = buildJsonApiBody('opportunity', attributes, id)
    const res = await this.client(credentials).put(`${PATHS.opportunities}/${id}`, body)
    return transformDeal(res.data as RawBoondManagerOpportunity)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`${PATHS.opportunities}/${id}`)
  }

  // ── Activities (Actions) ──────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const { page, maxResults } = this.pageParams(params)
    const res = await this.client(credentials).list(PATHS.actions, page, maxResults)
    return (res.data ?? []).map(item => transformActivity(item as RawBoondManagerAction))
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const res = await this.client(credentials).get(`${PATHS.actions}/${id}`)
    if (!res.data) {
      throw Object.assign(new Error(`BoondManager: action ${id} not found`), { statusCode: 404 })
    }
    return transformActivity(res.data as RawBoondManagerAction)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const attributes = untransformActivity(data)
    const relationships: Record<string, unknown> = {}
    if (data.contact_id) {
      relationships['contact'] = { data: { id: data.contact_id, type: 'contact' } }
    }
    if (data.company_id) {
      relationships['company'] = { data: { id: data.company_id, type: 'company' } }
    }
    const body = buildJsonApiBody('action', attributes, undefined, relationships)
    const res = await this.client(credentials).post(PATHS.actions, body)
    return transformActivity(res.data as RawBoondManagerAction)
  }

  async updateActivity(credentials: Credentials, id: string, data: Partial<Activity>): Promise<Activity> {
    const attributes = untransformActivity(data)
    const body = buildJsonApiBody('action', attributes, id)
    const res = await this.client(credentials).put(`${PATHS.actions}/${id}`, body)
    return transformActivity(res.data as RawBoondManagerAction)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`${PATHS.actions}/${id}`)
  }
}
