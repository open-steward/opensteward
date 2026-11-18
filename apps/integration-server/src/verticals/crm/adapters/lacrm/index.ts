import { simpleApiKey } from '@opensteward/shared'
/**
 * Less Annoying CRM (LACRM) adapter for the CRM vertical.
 *
 * Maps the LACRM REST API v2 to canonical CRM resources.
 * Docs: https://account.lessannoyingcrm.com/api_docs/v2/Getting_Started/Connect
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (14):
 *   Contacts:   list, get, create, update
 *   Companies:  list, get, create            (IsCompany flag on Contact endpoint)
 *   Deals:      list, get, create, update    (PipelineItem endpoint)
 *   Pipelines:  list, get
 *   Notes:      list, get, create
 *
 * Omitted (16) — registry returns HTTP 501 automatically:
 *   Contacts delete   — LACRM does not support contact deletion via API
 *   Companies update/delete — not supported via API
 *   Deals delete      — not supported via API
 *   Activities (all)  — no dedicated Activity resource in LACRM
 *   Notes update/delete — not supported via API
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Note } from '../../schema/note'
import type { WebhookEvent } from '../../schema/webhook'

import { LacrmClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyWebhook as _verifyWebhook, parseWebhookEvents as _parseWebhookEvents } from './webhook'
import {
  transformContact,
  untransformContact,
  type RawLacrmContact,
} from './transform/contact'
import {
  transformCompany,
  untransformCompany,
  type RawLacrmCompany,
} from './transform/company'
import {
  transformDeal,
  untransformDeal,
  type RawLacrmPipelineItem,
} from './transform/deal'
import {
  transformPipeline,
  type RawLacrmPipeline,
} from './transform/pipeline'
import {
  transformNote,
  untransformNote,
  type RawLacrmNote,
} from './transform/note'

export interface LacrmAdapterConfig {
  /** LACRM API key — sent as Bearer token. */
  apiKey?: string
  /**
   * LACRM user code — required alongside the API key.
   * Sent in the `UserCode` request header.
   */
  userCode?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class LacrmAdapter implements CrmAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'lacrm'
  readonly version = '0.1.0'

  private apiKey: string | undefined
  private userCode: string | undefined

  constructor(config: LacrmAdapterConfig = {}) {
    this.apiKey = config.apiKey
    this.userCode = config.userCode
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // LACRM uses API key authentication, not OAuth2.
    return '#lacrm-api-key'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return {
      accessToken: this.apiKey ?? '',
      extra: { userCode: this.userCode ?? '' },
    } as Credentials & { extra: Record<string, unknown> }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys do not expire.
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

  private client(credentials: Credentials): LacrmClient {
    const effective: Credentials = this.apiKey
      ? ({
          accessToken: this.apiKey,
          extra: { userCode: this.userCode ?? '' },
        } as Credentials & { extra: Record<string, unknown> })
      : credentials
    return new LacrmClient(effective)
  }

  private pageParam(params: QueryParams): Record<string, unknown> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const page = params['page'] ?? 1
    return { Page: page, RowsPerPage: limit }
  }

  // ── Contacts ──────────────────────────────────────────────────────────────
  // LACRM does not support contact deletion via API.

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const { items } = await this.client(credentials).list<RawLacrmContact>(
      '/Contact',
      { ...this.pageParam(params), IsCompany: false },
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawLacrmContact>('/Contact', {
      ContactId: id,
    })
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).post<RawLacrmContact>('/Contact', body)
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).put<RawLacrmContact>(
      '/Contact',
      { ContactId: id },
      body,
    )
    return transformContact(raw)
  }

  // ── Companies ─────────────────────────────────────────────────────────────
  // LACRM represents companies as Contacts with IsCompany = true.
  // Update and delete are not supported via API.

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const { items } = await this.client(credentials).list<RawLacrmCompany>(
      '/Contact',
      { ...this.pageParam(params), IsCompany: true },
    )
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawLacrmCompany>('/Contact', {
      ContactId: id,
    })
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const raw = await this.client(credentials).post<RawLacrmCompany>('/Contact', body)
    return transformCompany(raw)
  }

  // ── Deals (PipelineItems) ─────────────────────────────────────────────────
  // Delete is not supported via API.

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const { items } = await this.client(credentials).list<RawLacrmPipelineItem>(
      '/PipelineItem',
      this.pageParam(params),
    )
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawLacrmPipelineItem>('/PipelineItem', {
      PipelineItemId: id,
    })
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const raw = await this.client(credentials).post<RawLacrmPipelineItem>('/PipelineItem', body)
    return transformDeal(raw)
  }

  async updateDeal(
    credentials: Credentials,
    id: string,
    data: Partial<Deal>,
  ): Promise<Deal> {
    const body = untransformDeal(data)
    const raw = await this.client(credentials).put<RawLacrmPipelineItem>(
      '/PipelineItem',
      { PipelineItemId: id },
      body,
    )
    return transformDeal(raw)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const { items } = await this.client(credentials).list<RawLacrmPipeline>(
      '/Pipeline',
      this.pageParam(params),
    )
    return items.map(transformPipeline)
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const raw = await this.client(credentials).get<RawLacrmPipeline>('/Pipeline', {
      PipelineId: id,
    })
    return transformPipeline(raw)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────
  // Update and delete are not supported via API.

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const { items } = await this.client(credentials).list<RawLacrmNote>(
      '/Note',
      this.pageParam(params),
    )
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.client(credentials).get<RawLacrmNote>('/Note', {
      NoteId: id,
    })
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const raw = await this.client(credentials).post<RawLacrmNote>('/Note', body)
    return transformNote(raw)
  }
}
