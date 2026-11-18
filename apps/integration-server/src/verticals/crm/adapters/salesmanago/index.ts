import { simpleApiKey } from '@opensteward/shared'
/**
 * SALESmanago adapter for the CRM vertical.
 *
 * Maps the SALESmanago REST API to canonical CRM resources.
 * Docs: https://docs.salesmanago.com
 *
 * Auth: clientId (accessToken) + apiSecret (extra.apiSecret) — SHA1 HMAC in POST body
 * Notable:
 *   - Polish email marketing / marketing automation platform
 *   - Contact-centric; no native deal/pipeline or company resources
 *   - POST body authentication (no auth headers)
 *   - Uses epoch-ms timestamps
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented:
 *   Contacts: list, get, create, update, delete
 *   Companies: returns [] (not natively supported)
 *   Deals: returns [] (not natively supported)
 *   Pipelines: returns [] (not natively supported)
 *   Activities (Tasks): list, get, create
 *   Notes: list, get, create
 *   Webhooks: verifyWebhook (stub), parseWebhookEvents (stub)
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { SalesmanagoCli } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { DEFAULT_PAGE_SIZE } from './constants'
import { transformContact, untransformContact, type RawSaleSmanagoContact } from './transform/contact'
import { transformActivity, untransformActivity, type RawSaleSmanagoTask } from './transform/activity'
import { transformNote, untransformNote, type RawSaleSmanagoNote } from './transform/note'

export interface SalesmanagoAdapterConfig {
  apiKey?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class SalesmanagoAdapter implements CrmAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'salesmanago'
  readonly version = '0.1.0'

  constructor(_config: SalesmanagoAdapterConfig = {}) {}

  // ── Auth (API key — no OAuth flow) ────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return '#api-key-auth'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return { accessToken: '' }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): SalesmanagoCli {
    return new SalesmanagoCli(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const limit = Number(params['limit'] ?? DEFAULT_PAGE_SIZE)
    const page = Number(params['page'] ?? 1)
    const offset = (page - 1) * limit
    return { limit, offset }
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const p = this.listParams(params)
    const res = await this.client(credentials).post<{ contacts: RawSaleSmanagoContact[] }>(
      '/api/contact/list',
      { from: p['offset'], size: p['limit'] },
    )
    return (res.contacts ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).post<{ contact: RawSaleSmanagoContact }>(
      '/api/contact/get',
      { contactId: id },
    )
    return transformContact(res.contact)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).post<{ contactId: string }>(
      '/api/contact/upsert',
      { contact: body },
    )
    return this.getContact(credentials, res.contactId)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    await this.client(credentials).post<unknown>(
      '/api/contact/upsert',
      { contact: { ...body, contactId: id } },
    )
    return this.getContact(credentials, id)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).post<unknown>('/api/contact/delete', { contactId: id })
  }

  // ── Companies (not natively supported) ───────────────────────────────────

  async listCompanies(_credentials: Credentials, _params: QueryParams): Promise<Company[]> {
    return []
  }

  // ── Deals (not natively supported) ───────────────────────────────────────

  async listDeals(_credentials: Credentials, _params: QueryParams): Promise<Deal[]> {
    return []
  }

  // ── Pipelines (not natively supported) ───────────────────────────────────

  async listPipelines(_credentials: Credentials, _params: QueryParams): Promise<Pipeline[]> {
    return []
  }

  // ── Activities (Tasks) ────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const p = this.listParams(params)
    const res = await this.client(credentials).post<{ tasks: RawSaleSmanagoTask[] }>(
      '/api/contact/task/list',
      { from: p['offset'], size: p['limit'] },
    )
    return (res.tasks ?? []).map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const res = await this.client(credentials).post<{ task: RawSaleSmanagoTask }>(
      '/api/contact/task/get',
      { taskId: id },
    )
    return transformActivity(res.task)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const res = await this.client(credentials).post<{ taskId: string }>(
      '/api/contact/task/upsert',
      { task: body },
    )
    return this.getActivity(credentials, res.taskId)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const p = this.listParams(params)
    const res = await this.client(credentials).post<{ notes: RawSaleSmanagoNote[] }>(
      '/api/contact/note/list',
      { from: p['offset'], size: p['limit'] },
    )
    return (res.notes ?? []).map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const res = await this.client(credentials).post<{ note: RawSaleSmanagoNote }>(
      '/api/contact/note/get',
      { noteId: id },
    )
    return transformNote(res.note)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const res = await this.client(credentials).post<{ noteId: string }>(
      '/api/contact/note/upsert',
      { note: body },
    )
    return this.getNote(credentials, res.noteId)
  }
}
