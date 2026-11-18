import { customForm, pageLocally } from '@opensteward/shared'
/**
 * Sage CRM adapter for the CRM vertical.
 *
 * Maps the Sage CRM RESTful API (sagecrm2) to canonical CRM resources.
 * Docs: https://developer.sage.com/crm/apis/crm/2024.02/crm-2024r2-rest-api-ref
 *
 * Auth: HTTP Basic with a Sage CRM user name and password, against the
 * customer's own server: "Authorization: Basic {credentials} ... Where
 * {credentials} is user name and password separated by a colon (:) and encoded
 * in Base64." URL: "http://{server}/sdata/{installName}j/sagecrm2/-/{resource}"
 * (Using the API page of the reference).
 *
 * Reads: every documented "Retrieve all {Resource} records" GET returns the
 * whole collection as a JSON array and takes only `orderBy`, so each list
 * fetches the collection ordered by its key and pages it locally.
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 *   Contacts (Person), Companies (Company), Deals (Opportunity),
 *   Activities (Communication), Notes (Notes): list, get.
 *   Pipelines: list refuses with 501, Sage CRM documents no pipeline resource.
 *   Create/update/delete: unchanged by the read rebuild; they still call their
 *   original undocumented paths (/people, /companies, /opportunities,
 *   /actions, /notes). Their responses now pass through the rebuilt
 *   transforms, which throw 502 when the documented key or a required field
 *   is missing, where the old transforms returned a record with an empty-string id.
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { DEFAULT_INSTALL_NAME, SageCrmClient } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { transformContact, untransformContact, type RawSageCrmPerson } from './transform/contact'
import { transformCompany, untransformCompany, type RawSageCrmCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawSageCrmOpportunity } from './transform/deal'
import {
  transformActivity,
  untransformActivity,
  type RawSageCrmCommunication,
} from './transform/activity'
import { transformNote, untransformNote, type RawSageCrmNote } from './transform/note'

export interface SageCrmAdapterConfig {
  apiKey?: string
}

const FORM = customForm({
  fields: [
    {
      name: 'serverUrl',
      label: 'Sage CRM server URL',
      type: 'url',
      placeholder: 'https://crm.example.com',
      helpText: 'Scheme and server name or IP address of your Sage CRM server.',
      required: true,
    },
    {
      name: 'installName',
      label: 'Installation name',
      type: 'text',
      placeholder: DEFAULT_INSTALL_NAME,
      helpText:
        'The installation name chosen in the Sage CRM Setup Wizard. Leave empty for the default, "crm".',
      required: false,
    },
    {
      name: 'username',
      label: 'User name',
      type: 'text',
      helpText:
        'An active Sage CRM user with logon permissions (not a disabled or resource account).',
      required: true,
    },
    { name: 'password', label: 'Password', type: 'password', required: true },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const serverUrl = (fields['serverUrl'] ?? '').trim().replace(/\/+$/, '')
    const installName = (fields['installName'] ?? '').trim() || DEFAULT_INSTALL_NAME
    const username = (fields['username'] ?? '').trim()
    const password = fields['password'] ?? ''
    if (!/^https?:\/\/[^/]+/i.test(serverUrl)) {
      throw new Error('Sage CRM server URL must start with http:// or https://.')
    }
    if (!username) throw new Error('User name is required.')
    if (!password) throw new Error('Password is required.')
    return {
      accessToken: Buffer.from(`${username}:${password}`, 'utf8').toString('base64'),
      extra: { serverUrl, installName },
    }
  },
})

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

export class SageCrmAdapter implements CrmAdapter {
  credentialFields = FORM.credentialFields
  exchangeCredentials = FORM.exchangeCredentials

  readonly platform = 'sage-crm'
  readonly version = '0.2.0'

  constructor(_config: SageCrmAdapterConfig = {}) {}

  // ── Auth (Basic, user name + password: no OAuth flow) ─────────────────────

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

  private client(credentials: Credentials): SageCrmClient {
    return new SageCrmClient(credentials)
  }

  // ── Contacts (Person) ─────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const rows = await this.client(credentials).listAll<RawSageCrmPerson>(
      'Person',
      'Pers_PersonId asc',
    )
    return pageLocally(rows, params).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    return transformContact(await this.client(credentials).getByKey<RawSageCrmPerson>('Person', id))
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).post<RawSageCrmPerson>('/people', body)
    return transformContact(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).put<RawSageCrmPerson>(`/people/${id}`, body)
    return transformContact(res)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/people/${id}`)
  }

  // ── Companies (Company) ───────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const rows = await this.client(credentials).listAll<RawSageCrmCompany>(
      'Company',
      'Comp_CompanyId asc',
    )
    return pageLocally(rows, params).map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    return transformCompany(
      await this.client(credentials).getByKey<RawSageCrmCompany>('Company', id),
    )
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).post<RawSageCrmCompany>('/companies', body)
    return transformCompany(res)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).put<RawSageCrmCompany>(`/companies/${id}`, body)
    return transformCompany(res)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/companies/${id}`)
  }

  // ── Deals (Opportunity) ───────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const rows = await this.client(credentials).listAll<RawSageCrmOpportunity>(
      'Opportunity',
      'Oppo_OpportunityId asc',
    )
    return pageLocally(rows, params).map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    return transformDeal(
      await this.client(credentials).getByKey<RawSageCrmOpportunity>('Opportunity', id),
    )
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).post<RawSageCrmOpportunity>('/opportunities', body)
    return transformDeal(res)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).put<RawSageCrmOpportunity>(
      `/opportunities/${id}`,
      body,
    )
    return transformDeal(res)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/opportunities/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  async listPipelines(_credentials: Credentials, _params: QueryParams): Promise<Pipeline[]> {
    throw notSupported(
      'Sage CRM cannot list pipelines: none of the 29 resources in its RESTful API reference ' +
        'is a pipeline or stage list ("Forecast" holds per-user forecast figures: fcst_bestcase, ' +
        'fcst_commit, fcst_likely).',
    )
  }

  // ── Activities (Communication) ────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const rows = await this.client(credentials).listAll<RawSageCrmCommunication>(
      'Communication',
      'Comm_CommunicationId asc',
    )
    return pageLocally(rows, params).map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    return transformActivity(
      await this.client(credentials).getByKey<RawSageCrmCommunication>('Communication', id),
    )
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const res = await this.client(credentials).post<RawSageCrmCommunication>('/actions', body)
    return transformActivity(res)
  }

  // ── Notes (Notes) ─────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const rows = await this.client(credentials).listAll<RawSageCrmNote>('Notes', 'Note_NoteId asc')
    return pageLocally(rows, params).map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    return transformNote(await this.client(credentials).getByKey<RawSageCrmNote>('Notes', id))
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const res = await this.client(credentials).post<RawSageCrmNote>('/notes', body)
    return transformNote(res)
  }
}
