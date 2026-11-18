import { simpleApiKey } from '@opensteward/shared'
/**
 * Rex CRM adapter for the CRM vertical.
 *
 * Maps the Rex Software JSON-RPC 2.0 API to canonical CRM resources.
 * Docs: https://apidocs.rexsoftware.com/
 *
 * Auth: Bearer token (session token from login or API key)
 * Notable:
 *   - All requests POST to the same endpoint with method + input in body (JSON-RPC 2.0)
 *   - Contacts → contacts resource
 *   - Companies → accounts resource (companies)
 *   - Deals → listings resource (property listings — Rex is a real estate CRM)
 *   - Activities → appointments resource
 *   - Notes → notes resource
 *   - Pipelines: not applicable — omitted
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented:
 *   Contacts:   list, get, create, update, delete
 *   Companies:  list, get, create, update, delete
 *   Deals:      list, get, create, update, delete  (listings)
 *   Activities: list, get, create, update, delete  (appointments)
 *   Notes:      list, get, create, delete
 *   Auth:       getAuthUrl (stub), exchangeCode (stub), refreshCredentials
 *   Webhooks:   verifyWebhook (passthrough), parseWebhookEvents (stub)
 *
 * Omitted:
 *   Pipelines — not applicable to Rex CRM
 *   Notes:  updateNote — not standard in Rex
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { RexCrmClient } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { DEFAULT_PAGE_SIZE } from './constants'
import { transformContact, untransformContact, type RawRexContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawRexCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawRexListing } from './transform/deal'
import { transformActivity, untransformActivity, type RawRexAppointment } from './transform/activity'
import { transformNote, untransformNote, type RawRexNote } from './transform/note'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface RexCrmAdapterConfig {}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class RexCrmAdapter implements CrmAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'rex-crm'
  readonly version = '0.1.0'

   
  constructor(_config: RexCrmAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

   
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

  private client(credentials: Credentials): RexCrmClient {
    return new RexCrmClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    const page = Number(params['page'] ?? 1)
    const limit = Number(params['limit'] ?? DEFAULT_PAGE_SIZE)
    return {
      limit,
      offset: (page - 1) * limit,
    }
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const { items } = await this.client(credentials).list<RawRexContact>(
      'contacts/search',
      this.pageParams(params),
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).read<RawRexContact>('contacts/read', id)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).create<RawRexContact>(
      'contacts/create',
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).update<RawRexContact>(
      'contacts/update',
      id,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('contacts/delete', id)
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const { items } = await this.client(credentials).list<RawRexCompany>(
      'companies/search',
      this.pageParams(params),
    )
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).read<RawRexCompany>('companies/read', id)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).create<RawRexCompany>(
      'companies/create',
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async updateCompany(credentials: Credentials, id: string, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).update<RawRexCompany>(
      'companies/update',
      id,
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('companies/delete', id)
  }

  // ── Deals (Listings) ──────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const { items } = await this.client(credentials).list<RawRexListing>(
      'listings/search',
      this.pageParams(params),
    )
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).read<RawRexListing>('listings/read', id)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).create<RawRexListing>(
      'listings/create',
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).update<RawRexListing>(
      'listings/update',
      id,
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('listings/delete', id)
  }

  // ── Activities (Appointments) ─────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const { items } = await this.client(credentials).list<RawRexAppointment>(
      'appointments/search',
      this.pageParams(params),
    )
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).read<RawRexAppointment>('appointments/read', id)
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const raw = await this.client(credentials).create<RawRexAppointment>(
      'appointments/create',
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async updateActivity(credentials: Credentials, id: string, data: Partial<Activity>): Promise<Activity> {
    const raw = await this.client(credentials).update<RawRexAppointment>(
      'appointments/update',
      id,
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('appointments/delete', id)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const { items } = await this.client(credentials).list<RawRexNote>(
      'notes/search',
      this.pageParams(params),
    )
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.client(credentials).read<RawRexNote>('notes/read', id)
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).create<RawRexNote>(
      'notes/create',
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('notes/delete', id)
  }
}
