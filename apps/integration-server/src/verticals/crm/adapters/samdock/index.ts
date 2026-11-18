import { pageLocally, simpleApiKey } from '@opensteward/shared'
/**
 * Samdock CRM adapter for the CRM vertical.
 *
 * Docs: https://samdock.readme.io/ (index: https://samdock.readme.io/llms.txt).
 * Host: https://samdock.app (the OpenAPI's "Samdock Production API").
 * Auth: `Authorization: Bearer <JWT>`, the only documented security scheme.
 *
 * ── Reads ───────────────────────────────────────────────────────────────
 *
 *   Contacts:  GET /api/contacts/Persons, GET /api/contacts/persons/{id}
 *   Companies: GET /api/contacts/Organizations, GET /api/contacts/organizations/{id}
 *   Deals:     GET /api/deals, GET /api/deals/{id}
 *
 * Each browse endpoint declares `"parameters": []` and a bare-array 200, so
 * it returns the whole collection and is paged locally.
 *
 * Refused (501): pipelines (the documented Pipeline has no name) and notes
 * (Samdock documents no notes resource).
 *
 * The create/update/delete methods and createNote still call their original,
 * undocumented paths; they are outside this rebuild.
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Note } from '../../schema/note'
import type { WebhookEvent } from '../../schema/webhook'

import { SamdockClient } from './client'
import {
  verifyWebhook as _verifyWebhook,
  parseWebhookEvents as _parseWebhookEvents,
} from './webhook'
import { transformContact, untransformContact, type RawSamdockContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawSamdockCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawSamdockDeal } from './transform/deal'
import { transformNote, untransformNote, type RawSamdockNote } from './transform/note'

export interface SamdockAdapterConfig {
  apiKey?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'Bearer token (JWT)',
  helpText: 'Sent as Authorization: Bearer <token>, the only auth scheme Samdock documents.',
})

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/**
 * https://samdock.readme.io/reference/pipelinescontroller_browse.md documents the
 * pipeline as `"Pipeline": { "properties": { "_id": …, "stages": … }, "required": ["_id", "stages"] }`:
 * no name, which the canonical Pipeline requires. Its 200 is also typed as one
 * `Pipeline` object while the operation says "All pipelines are retrieved".
 */
const PIPELINE_REFUSAL =
  'Samdock cannot list pipelines: its documented Pipeline has only "_id" and "stages", no name, ' +
  'and GET /api/deals/pipelines is typed as a single Pipeline object'

export class SamdockAdapter implements CrmAdapter {
  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'samdock'
  readonly version = '0.1.0'

  private apiKey: string | undefined

  constructor(config: SamdockAdapterConfig = {}) {
    this.apiKey = config.apiKey
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return ''
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.apiKey) throw new Error('Samdock: apiKey required')
    return { accessToken: this.apiKey }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return _verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return _parseWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private c(creds: Credentials): SamdockClient {
    return new SamdockClient(this.apiKey ? { accessToken: this.apiKey } : creds)
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const rows = await this.c(credentials).browse<RawSamdockContact>('/api/contacts/Persons')
    return pageLocally(rows, params).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.c(credentials).get<RawSamdockContact>(
      `/api/contacts/persons/${encodeURIComponent(id)}`,
    )
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.c(credentials).post<RawSamdockContact>(
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
    const raw = await this.c(credentials).put<RawSamdockContact>(
      `/contacts/${id}`,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/contacts/${id}`)
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const rows = await this.c(credentials).browse<RawSamdockCompany>('/api/contacts/Organizations')
    return pageLocally(rows, params).map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.c(credentials).get<RawSamdockCompany>(
      `/api/contacts/organizations/${encodeURIComponent(id)}`,
    )
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.c(credentials).post<RawSamdockCompany>(
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
    const raw = await this.c(credentials).put<RawSamdockCompany>(
      `/organizations/${id}`,
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/organizations/${id}`)
  }

  // ── Deals ─────────────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const rows = await this.c(credentials).browse<RawSamdockDeal>('/api/deals')
    return pageLocally(rows, params).map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.c(credentials).get<RawSamdockDeal>(
      `/api/deals/${encodeURIComponent(id)}`,
    )
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.c(credentials).post<RawSamdockDeal>('/deals', untransformDeal(data))
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.c(credentials).put<RawSamdockDeal>(`/deals/${id}`, untransformDeal(data))
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/deals/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  async listPipelines(_credentials: Credentials, _params: QueryParams): Promise<Pipeline[]> {
    throw notSupported(PIPELINE_REFUSAL)
  }

  async getPipeline(_credentials: Credentials, _id: string): Promise<Pipeline> {
    throw notSupported(
      'Samdock cannot read a pipeline: it documents no read-by-id for pipelines, and its Pipeline has no name',
    )
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  /**
   * The docs index (https://samdock.readme.io/llms.txt) and its 122 reference pages
   * never mention notes: Samdock documents persons, organizations, deals, leads,
   * pipelines, activities and tasks, and no notes resource.
   */
  async listNotes(_credentials: Credentials, _params: QueryParams): Promise<Note[]> {
    throw notSupported('Samdock cannot list notes: its API documents no notes resource')
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.c(credentials).post<RawSamdockNote>('/notes', untransformNote(data))
    return transformNote(raw)
  }
}
