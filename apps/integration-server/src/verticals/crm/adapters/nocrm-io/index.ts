import { pageLocally, pageOffset, reportUpstreamPage, simpleApiKey } from '@opensteward/shared'
/**
 * noCRM.io adapter for the CRM vertical.
 *
 * Maps the noCRM.io REST API v2 to canonical CRM resources.
 * Docs: https://www.nocrm.io/api
 *
 * ── Auth ─────────────────────────────────────────────────────────────────
 *   API key passed as X-API-KEY header on every request.
 *   credentials.accessToken = API key
 *   credentials.extra.subdomain = account subdomain (e.g. "acme")
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented:
 *   Contacts:  list, get, create
 *   Notes:     list (per lead), get, create
 *   Companies: list, get, create  (noCRM "Client Folders" — GET/POST /clients)
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * All 6 canonical CRM resources are available for this adapter.
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Note } from '../../schema/note'
import type { WebhookEvent } from '../../schema/webhook'

import { NocrmIoClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { verifyWebhook as _verifyWebhook, parseWebhookEvents as _parseWebhookEvents } from './webhook'
import {
  transformContact,
  untransformContact,
  type RawNocrmContact,
} from './transform/contact'
import {
  transformNote,
  untransformNote,
  type RawNocrmNote,
} from './transform/note'
import {
  transformCompany,
  untransformCompany,
  type RawNocrmClient,
} from './transform/company'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class NocrmIoAdapter implements CrmAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'nocrm-io'
  readonly version = '0.1.0'

  /**
   * GET /leads: "To get more than 100 leads, you need to do multiple requests
   * and use the offset parameter". /clients and /leads/{id}/comments are
   * unpaginated and paged locally, so every list method honours this maximum.
   */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // noCRM.io uses API key auth, not OAuth2.
    return ''
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    // Caller passes apiKey as code, subdomain as redirectUri.
    return {
      accessToken: code,
      refreshToken: redirectUri,
    }
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

  private client(credentials: Credentials): NocrmIoClient {
    return new NocrmIoClient(credentials)
  }

  // ── Contacts ──────────────────────────────────────────────────────────────
  // noCRM.io exposes leads as contacts: GET /leads, GET /leads/{id}, POST /leads

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const size = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const offset = pageOffset(params, size)
    const { rows, totalCount } = await this.client(credentials).listPage<RawNocrmContact>(
      '/leads',
      { limit: size, offset },
    )
    const raw = rows ?? []
    // X-TOTAL-COUNT is the total before pagination; without it only a short
    // page is known to be the last.
    reportUpstreamPage(params, {
      pageSize: size,
      ...(totalCount !== undefined
        ? { totalCount, hasMore: offset + raw.length < totalCount }
        : raw.length < size
          ? { hasMore: false }
          : {}),
    })
    return raw.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawNocrmContact>(
      `/leads/${id}`,
    )
    if (!raw) {
      throw Object.assign(new Error(`noCRM.io: contact ${id} not found`), { statusCode: 404 })
    }
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).post<RawNocrmContact>(
      '/leads',
      body,
    )
    if (!raw) {
      throw new Error('noCRM.io: contact creation returned no data')
    }
    return transformContact(raw)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────
  // noCRM.io exposes notes as lead comments: GET/POST /leads/{lead_id}/comments

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const leadId = params['lead_id'] ?? params['deal_id']
    if (!leadId) {
      throw Object.assign(
        new Error('noCRM.io: listNotes requires lead_id (or deal_id) in params'),
        { statusCode: 400 },
      )
    }
    // Documents only lead_id and direction: the whole list, paged here.
    const raw = await this.client(credentials).get<RawNocrmNote[]>(
      `/leads/${leadId}/comments`,
    )
    // The docs example is a bare array; anything else carries no rows.
    return pageLocally((Array.isArray(raw) ? raw : []).map(transformNote), params)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    // noCRM.io does not expose a single-comment endpoint; fetch by listing
    // and filtering. Callers should prefer listNotes where possible.
    const raw = await this.client(credentials).get<RawNocrmNote>(
      `/comments/${id}`,
    )
    if (!raw) {
      throw Object.assign(new Error(`noCRM.io: note ${id} not found`), { statusCode: 404 })
    }
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const leadId = data.deal_id
    if (!leadId) {
      throw Object.assign(
        new Error('noCRM.io: createNote requires deal_id (lead id) on the note'),
        { statusCode: 400 },
      )
    }
    const body = untransformNote(data)
    const raw = await this.client(credentials).post<RawNocrmNote>(
      `/leads/${leadId}/comments`,
      body,
    )
    if (!raw) {
      throw new Error('noCRM.io: note creation returned no data')
    }
    return transformNote(raw)
  }

  // ── Companies ─────────────────────────────────────────────────────────────
  // noCRM.io exposes "Client Folders" as company records: GET /clients, POST /clients

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    // Documents only direction and order, no limit/offset: the whole list,
    // paged here.
    const raw = await this.client(credentials).get<RawNocrmClient[]>('/clients')
    // The docs example is a bare array; anything else carries no rows.
    return pageLocally((Array.isArray(raw) ? raw : []).map(transformCompany), params)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawNocrmClient>(
      `/clients/${id}`,
    )
    if (!raw) {
      throw Object.assign(new Error(`noCRM.io: company ${id} not found`), { statusCode: 404 })
    }
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const raw = await this.client(credentials).post<RawNocrmClient>(
      '/clients',
      body,
    )
    if (!raw) {
      throw new Error('noCRM.io: company creation returned no data')
    }
    return transformCompany(raw)
  }
}
