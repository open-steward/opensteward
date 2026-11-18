import { reportUpstreamPage, simpleApiKey } from '@opensteward/shared'
/**
 * Dolibarr adapter for the CRM vertical.
 *
 * Maps the Dolibarr REST API to canonical CRM resources.
 * Docs: https://wiki.dolibarr.org/index.php/Module_Web_Services_API_REST_(developer)
 *
 * Auth: DOLAPIKEY header
 *   credentials.accessToken = the API key token
 * Base URL: ${instanceUrl}/api/index.php
 *   credentials.extra.instanceUrl = self-hosted instance URL
 *
 * Notable:
 *   - Open-source ERP/CRM, self-hosted
 *   - "Thirdparties" = companies, "Contacts" = individuals
 *   - Proposals = commercial deals, Actions = activities
 *   - Unix timestamps for dates
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented:
 *   Contacts: list, get, create, update, delete
 *   Companies (Thirdparties): list, get, create, update, delete
 *   Deals (Proposals): list, get, create, update, delete
 *   Activities (Agenda events): list, get (GET /agendaevents, /agendaevents/{id});
 *     create, update, delete still call the undocumented /actions path
 *   Notes: create only (still the undocumented /notes path)
 *
 * Refused with 501 NOT_SUPPORTED, before any request:
 *   Pipelines: the REST API exposes no opportunity-status dictionary (the
 *     llx_c_lead_status table has no route; /setup/dictionary/* has no entry).
 *   Notes list/get: the REST API has no notes resource. Notes are the
 *     note_private / note_public fields of other objects.
 *   Webhooks: stub
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { DolibarrClient } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { DEFAULT_PAGE_SIZE } from './constants'
import { transformContact, untransformContact, type RawDolibarrContact } from './transform/contact'
import {
  transformCompany,
  untransformCompany,
  type RawDolibarrThirdParty,
} from './transform/company'
import { transformDeal, untransformDeal, type RawDolibarrDeal } from './transform/deal'
import {
  transformActivity,
  untransformActivity,
  type RawDolibarrAction,
} from './transform/activity'
import { transformNote, untransformNote, type RawDolibarrNote } from './transform/note'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/**
 * GET /agendaevents with pagination_data=true (AgendaEvents::index, "@since
 * 21.0.0 Added data pagination"): "If this parameter is set to true the
 * response will include pagination data." Earlier versions return the bare
 * ActionComm[] array.
 */
interface DolibarrAgendaPage {
  data?: RawDolibarrAction[]
  pagination?: { total?: number; page?: number; page_count?: number; limit?: number }
}

// no OAuth config needed — API key auth
export type DolibarrAdapterConfig = Record<string, never>
const SIMPLE_API_KEY_FORM = simpleApiKey()

export class DolibarrAdapter implements CrmAdapter {
  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'dolibarr'
  readonly version = '0.1.0'

  constructor(_config: DolibarrAdapterConfig = {}) {}

  // ── Auth (API Key stub) ───────────────────────────────────────────────────

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

  private client(credentials: Credentials): DolibarrClient {
    return new DolibarrClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const limit = Number(params['limit'] ?? DEFAULT_PAGE_SIZE)
    const page = Number(params['page'] ?? 1)
    return { limit, page: page - 1 } // Dolibarr uses 0-based pages
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const { items } = await this.client(credentials).list<RawDolibarrContact>(
      '/contacts',
      this.listParams(params),
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<RawDolibarrContact>(`/contacts/${id}`)
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).post<RawDolibarrContact>('/contacts', body)
    return transformContact(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).put<RawDolibarrContact>(`/contacts/${id}`, body)
    return transformContact(res)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contacts/${id}`)
  }

  // ── Companies (Thirdparties in Dolibarr) ──────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const { items } = await this.client(credentials).list<RawDolibarrThirdParty>(
      '/thirdparties',
      this.listParams(params),
    )
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const res = await this.client(credentials).get<RawDolibarrThirdParty>(`/thirdparties/${id}`)
    return transformCompany(res)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).post<RawDolibarrThirdParty>('/thirdparties', body)
    return transformCompany(res)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).put<RawDolibarrThirdParty>(
      `/thirdparties/${id}`,
      body,
    )
    return transformCompany(res)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/thirdparties/${id}`)
  }

  // ── Deals (Proposals in Dolibarr) ─────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const { items } = await this.client(credentials).list<RawDolibarrDeal>(
      '/proposals',
      this.listParams(params),
    )
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const res = await this.client(credentials).get<RawDolibarrDeal>(`/proposals/${id}`)
    return transformDeal(res)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).post<RawDolibarrDeal>('/proposals', body)
    return transformDeal(res)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).put<RawDolibarrDeal>(`/proposals/${id}`, body)
    return transformDeal(res)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/proposals/${id}`)
  }

  // ── Pipelines (Opportunity stages) ────────────────────────────────────────

  async listPipelines(_credentials: Credentials, _params: QueryParams): Promise<Pipeline[]> {
    throw notSupported(
      'Dolibarr cannot list pipelines: its REST API exposes no opportunity-status dictionary ' +
        '(no /crm API exists, and /setup/dictionary/* has no lead-status entry; ' +
        'index.php answers "501 API not found (failed to include API file)")',
    )
  }

  // ── Activities (Agenda events in Dolibarr) ────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const { limit, page } = this.listParams(params)
    const res = await this.client(credentials).get<RawDolibarrAction[] | DolibarrAgendaPage>(
      '/agendaevents',
      { limit, page, pagination_data: true },
    )
    if (Array.isArray(res)) {
      // Pre-21.0 instance: no pagination block, so no end signal to report.
      return res.map(transformActivity)
    }
    const rows = res.data ?? []
    const total = res.pagination?.total
    if (typeof total === 'number') {
      reportUpstreamPage(params, {
        totalCount: total,
        hasMore: (Number(page) + 1) * Number(limit) < total,
      })
    }
    return rows.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const res = await this.client(credentials).get<RawDolibarrAction>(
      `/agendaevents/${encodeURIComponent(id)}`,
    )
    return transformActivity(res)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const res = await this.client(credentials).post<RawDolibarrAction>('/actions', body)
    return transformActivity(res)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const body = untransformActivity(data)
    const res = await this.client(credentials).put<RawDolibarrAction>(`/actions/${id}`, body)
    return transformActivity(res)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/actions/${id}`)
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  async listNotes(_credentials: Credentials, _params: QueryParams): Promise<Note[]> {
    throw notSupported(
      'Dolibarr cannot list notes: its REST API has no notes resource ' +
        '(no /notes path in the API explorer; notes are the note_private / note_public fields of other objects)',
    )
  }

  async getNote(_credentials: Credentials, _id: string): Promise<Note> {
    throw notSupported(
      'Dolibarr cannot read a note by id: its REST API has no notes resource ' +
        '(no /notes path in the API explorer; notes are the note_private / note_public fields of other objects)',
    )
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const res = await this.client(credentials).post<RawDolibarrNote>('/notes', body)
    return transformNote(res)
  }
}
