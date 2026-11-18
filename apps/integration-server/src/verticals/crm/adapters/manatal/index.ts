import { simpleApiKey } from '@opensteward/shared'
/**
 * Manatal adapter for the CRM vertical.
 *
 * Maps the Manatal REST API v3 to canonical CRM resources.
 * Docs: https://developers.manatal.com/reference/getting-started
 *
 * ── Auth ─────────────────────────────────────────────────────────────────
 *   API key (Token auth) passed as Authorization: Token <key> header.
 *   credentials.accessToken = API token from Manatal admin panel.
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (14):
 *   Contacts    (backed by /candidates/):   list, get, create, update, delete
 *   Companies   (backed by /organizations/): list, get, create, update, delete
 *   Deals       (backed by /jobs/):          list, get, create, update, delete
 *   Pipelines   (backed by /job-pipelines/): list, get
 *
 * Omitted — registry returns HTTP 501 automatically:
 *   Activities — not implemented: Manatal nests these per candidate/job with
 *                no top-level list endpoint.
 *   Notes      — not implemented: same nesting constraint.
 *
 * ── Webhooks ─────────────────────────────────────────────────────────────
 *   Manatal supports webhook subscriptions (POST /webhooks/) but does not
 *   document a signature verification scheme. Webhook methods are omitted.
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'

import { ManatalClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import {
  transformContact,
  untransformContact,
  type RawManatalCandidate,
} from './transform/contact'
import {
  transformCompany,
  untransformCompany,
  type RawManatalOrganization,
} from './transform/company'
import {
  transformDeal,
  untransformDeal,
  type RawManatalJob,
} from './transform/deal'
import {
  transformPipeline,
  type RawManatalPipeline,
} from './transform/pipeline'

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'API token',
  helpText: 'Generate your token in Manatal → Settings → API (admin access required).',
})

export class ManatalAdapter implements CrmAdapter {

  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'manatal'
  readonly version = '0.1.0'

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Manatal uses API token auth, not OAuth2.
    return ''
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // Not used — callers go through exchangeCredentials instead.
    return { accessToken: code }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Static API tokens do not expire.
    return credentials
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): ManatalClient {
    return new ManatalClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      page_size: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params['page'] != null) out.page = params['page']
    return out
  }

  // ── Contacts (backed by Manatal /candidates/) ─────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const res = await this.client(credentials).list<RawManatalCandidate>(
      '/candidates/',
      this.pageParams(params),
    )
    return (res.results ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawManatalCandidate>(`/candidates/${id}/`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).post<RawManatalCandidate>('/candidates/', body)
    return transformContact(raw)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).patch<RawManatalCandidate>(`/candidates/${id}/`, body)
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/candidates/${id}/`)
  }

  // ── Companies (backed by Manatal /organizations/) ─────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const res = await this.client(credentials).list<RawManatalOrganization>(
      '/organizations/',
      this.pageParams(params),
    )
    return (res.results ?? []).map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawManatalOrganization>(`/organizations/${id}/`)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const raw = await this.client(credentials).post<RawManatalOrganization>('/organizations/', body)
    return transformCompany(raw)
  }

  async updateCompany(credentials: Credentials, id: string, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const raw = await this.client(credentials).patch<RawManatalOrganization>(`/organizations/${id}/`, body)
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/organizations/${id}/`)
  }

  // ── Deals (backed by Manatal /jobs/) ─────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const res = await this.client(credentials).list<RawManatalJob>(
      '/jobs/',
      this.pageParams(params),
    )
    return (res.results ?? []).map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawManatalJob>(`/jobs/${id}/`)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const raw = await this.client(credentials).post<RawManatalJob>('/jobs/', body)
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const raw = await this.client(credentials).patch<RawManatalJob>(`/jobs/${id}/`, body)
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/jobs/${id}/`)
  }

  // ── Pipelines (backed by Manatal /job-pipelines/) ─────────────────────────

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const res = await this.client(credentials).list<RawManatalPipeline>(
      '/job-pipelines/',
      this.pageParams(params),
    )
    return (res.results ?? []).map(transformPipeline)
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const raw = await this.client(credentials).get<RawManatalPipeline>(`/job-pipelines/${id}/`)
    return transformPipeline(raw)
  }
}
