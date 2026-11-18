import { pageOffset, reportUpstreamPage, simpleApiKey } from '@opensteward/shared'
/**
 * Reply.io adapter for the CRM vertical.
 *
 * Maps the Reply.io REST API v3 to canonical CRM resources.
 * Docs: https://docs.reply.io/api-reference/introduction
 *
 * ── Auth ─────────────────────────────────────────────────────────────────
 *   API key passed as Bearer token:
 *   Authorization: Bearer <api_key>
 *   credentials.accessToken = api_key
 *
 * ── Base URL ──────────────────────────────────────────────────────────────
 *   https://api.reply.io/v3
 *
 * ── Rate limits ───────────────────────────────────────────────────────────
 *   100 req/min per user; 3,000 req/hr per user.
 *   429 responses include a Retry-After header.
 *
 * ── Pagination ────────────────────────────────────────────────────────────
 *   GET list endpoints accept `top` (default 25, max 1000) and `skip`.
 *   Response shape: { items: T[], hasMore: boolean }
 *
 * ── Resource coverage ──────────────────────────────────────────────────
 * Unavailable: deal     — Reply.io is a sales engagement platform with no deal/opportunity concept; no /deals endpoint exists.
 * Unavailable: pipeline — No pipeline endpoint exists; Reply.io uses Sequences for outreach workflows, not deal pipelines.
 * Unavailable: note     — No notes endpoint exists in the Reply.io v3 API.
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Activity } from '../../schema/activity'

import { ReplyIoClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import {
  transformContact,
  untransformContact,
  type RawReplyIoContact,
} from './transform/contact'
import {
  transformCompany,
  untransformCompany,
  type RawReplyIoAccount,
} from './transform/company'
import {
  transformActivity,
  type RawReplyIoTask,
} from './transform/activity'

const SIMPLE_API_KEY_FORM = simpleApiKey()

export class ReplyIoAdapter implements CrmAdapter {

  // Every list endpoint documents `top` at most 1000 ("default 25, max 1000"),
  // and every list method pages by it and reports `hasMore`.
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'reply-io'
  readonly version = '0.1.0'

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Reply.io uses API key auth, not OAuth2.
    return ''
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // Caller passes the API key as code.
    return { accessToken: code }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys do not expire.
    return credentials
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): ReplyIoClient {
    return new ReplyIoClient(credentials)
  }

  /**
   * One upstream page per caller page: `top` is the caller's limit (capped at
   * the documented 1000) and `skip` is derived from the 1-based `page`.
   * Reply.io answers `{ items, hasMore }`; `hasMore` is forwarded as is.
   */
  private async listPage<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
  ): Promise<T[]> {
    const top = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await this.client(credentials).list<T>(path, {
      top,
      skip: pageOffset(params, top),
    })
    reportUpstreamPage(params, {
      ...(typeof res.hasMore === 'boolean' ? { hasMore: res.hasMore } : {}),
      pageSize: top,
    })
    return res.items ?? []
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const items = await this.listPage<RawReplyIoContact>(credentials, '/contacts', params)
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawReplyIoContact>(`/contacts/${id}`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).post<RawReplyIoContact>('/contacts', body)
    return transformContact(raw)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).patch<RawReplyIoContact>(`/contacts/${id}`, body)
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contacts/${id}`)
  }

  // ── Companies (contact-accounts) ──────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const items = await this.listPage<RawReplyIoAccount>(credentials, '/contact-accounts', params)
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawReplyIoAccount>(`/contact-accounts/${id}`)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const raw = await this.client(credentials).post<RawReplyIoAccount>('/contact-accounts', body)
    return transformCompany(raw)
  }

  // ── Activities (mapped from Reply.io Tasks) ───────────────────────────────
  // Reply.io Tasks (GET /v3/tasks) are the closest equivalent to CRM activities.
  // They represent manual actions: calls, meetings, emails, to-dos, LinkedIn steps.

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const items = await this.listPage<RawReplyIoTask>(credentials, '/tasks', params)
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).get<RawReplyIoTask>(`/tasks/${id}`)
    return transformActivity(raw)
  }
}
