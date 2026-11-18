import { simpleApiKey } from '@opensteward/shared'
/**
 * Kapture CRM adapter for the CRM vertical.
 *
 * Docs: https://dev.kapture.cx/kapture-api/ (full index: /kapture-api/llms.txt)
 *
 * Notable:
 *   - Field-first CRM for customer service and sales, built in Bangalore, India
 *   - credentials.accessToken = auth key
 *   - credentials.extra.subdomain = subdomain
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Kapture's first-party docs document only Ticket, Customer, Order and FAQ
 * endpoints, each a POST with a JSON body and `Authorization: Basic <Your
 * Token>`. None is under /api/, and none lists contacts, companies, deals,
 * pipelines, activities or notes from what a connection here carries.
 *
 * Refused with 501 NOT_SUPPORTED, before any request:
 *   Contacts, Companies: listContacts, getContact, listCompanies. The only
 *     customer list, "Pull Customer API by Date Range"
 *     (reference/api-reference/pull-customer-api-by-date-range.md), requires
 *     `cm_id` ("The Acount id which is unique.", Mandatory: Yes) and a
 *     createStartDate/createEndDate window ("Also at one hit we can pull a
 *     data of max 24 hours."). The connection carries no cm_id. The only
 *     documented lookup ("Get Customer API") takes kapture_customer_id, a
 *     customer (account) id, not a contact id.
 *   Deals, Pipelines, Activities, Notes: list and get. The docs have no
 *     endpoint for any of them.
 *
 * Writes (create/update/delete) are unchanged and still call undocumented
 * /api/<resource> paths with an undocumented `auth` header.
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { KaptureCrmClient } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { transformContact, untransformContact, type RawKaptureContact } from './transform/contact'
import { transformDeal, untransformDeal, type RawKaptureDeal } from './transform/deal'
import {
  transformActivity,
  untransformActivity,
  type RawKaptureActivity,
} from './transform/activity'
import { transformNote, untransformNote, type RawKaptureNote } from './transform/note'

export interface KaptureCrmAdapterConfig {
  authKey?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/**
 * Pull Customer API by Date Range: `cm_id` is Mandatory "Yes" ("The Acount id
 * which is unique."), and createStartDate/createEndDate are Mandatory "Yes"
 * ("Also at one hit we can pull a data of max 24 hours."). A connection holds
 * only an API key, so there is no cm_id to send.
 */
const NO_CUSTOMER_LIST =
  'the only customer list (Pull Customer API by Date Range) requires cm_id, "The Acount id which is unique.", ' +
  'which this connection does not carry, and a createStartDate/createEndDate window ' +
  '("Also at one hit we can pull a data of max 24 hours.")'

export class KaptureCrmAdapter implements CrmAdapter {
  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'kapture-crm'
  readonly version = '0.1.0'

  constructor(_config: KaptureCrmAdapterConfig = {}) {}

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

  private client(credentials: Credentials): KaptureCrmClient {
    return new KaptureCrmClient(credentials)
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(_credentials: Credentials, _params: QueryParams): Promise<Contact[]> {
    throw notSupported(`Kapture cannot list contacts: ${NO_CUSTOMER_LIST}.`)
  }

  async getContact(_credentials: Credentials, _id: string): Promise<Contact> {
    throw notSupported(
      'Kapture cannot get a contact by id: the only documented lookup (Get Customer API) takes ' +
        'kapture_customer_id, "The Id of the customer which is generated in Kapture Database", ' +
        'a customer id and not a contact id.',
    )
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).post<RawKaptureContact>('contacts', body)
    return transformContact(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).put<RawKaptureContact>(`contacts/${id}`, body)
    return transformContact(res)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`contacts/${id}`)
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  async listCompanies(_credentials: Credentials, _params: QueryParams): Promise<Company[]> {
    throw notSupported(`Kapture cannot list companies: ${NO_CUSTOMER_LIST}.`)
  }

  // ── Deals (Leads) ─────────────────────────────────────────────────────────

  async listDeals(_credentials: Credentials, _params: QueryParams): Promise<Deal[]> {
    throw notSupported('Kapture cannot list deals: its API documents no deal or lead endpoint.')
  }

  async getDeal(_credentials: Credentials, _id: string): Promise<Deal> {
    throw notSupported('Kapture cannot get a deal: its API documents no deal or lead endpoint.')
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).post<RawKaptureDeal>('leads', body)
    return transformDeal(res)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).put<RawKaptureDeal>(`leads/${id}`, body)
    return transformDeal(res)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`leads/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  async listPipelines(_credentials: Credentials, _params: QueryParams): Promise<Pipeline[]> {
    throw notSupported('Kapture cannot list pipelines: its API documents no pipeline endpoint.')
  }

  // ── Activities ────────────────────────────────────────────────────────────

  async listActivities(_credentials: Credentials, _params: QueryParams): Promise<Activity[]> {
    throw notSupported('Kapture cannot list activities: its API documents no activity endpoint.')
  }

  async getActivity(_credentials: Credentials, _id: string): Promise<Activity> {
    throw notSupported('Kapture cannot get an activity: its API documents no activity endpoint.')
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const res = await this.client(credentials).post<RawKaptureActivity>('activities', body)
    return transformActivity(res)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(_credentials: Credentials, _params: QueryParams): Promise<Note[]> {
    throw notSupported('Kapture cannot list notes: its API documents no notes endpoint.')
  }

  async getNote(_credentials: Credentials, _id: string): Promise<Note> {
    throw notSupported('Kapture cannot get a note: its API documents no notes endpoint.')
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const res = await this.client(credentials).post<RawKaptureNote>('notes', body)
    return transformNote(res)
  }
}
