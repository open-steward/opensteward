/**
 * CAS genesisWorld adapter for the OpenSteward CRM vertical.
 *
 * Maps the CAS genesisWorld REST API v7 to canonical CRM resources.
 * Docs: https://demo.cas.de/genesisrest.svc/v7.0/help/
 *
 * ── Auth ─────────────────────────────────────────────────────────────────────
 *   HTTP Basic authentication using username + API key (password).
 *   The `serverUrl` for the on-premise or hosted instance is stored in
 *   `credentials.extra.serverUrl`.
 *
 *   credentials.accessToken  = username
 *   credentials.refreshToken = API key / password
 *   credentials.extra.serverUrl = https://{your-instance}/genesisrest.svc
 *
 * ── Coverage ─────────────────────────────────────────────────────────────────
 *
 * Implemented:
 *   Contacts  (list, get, create, update, delete)
 *   Companies (list, get, create, update, delete)
 *   Activities (list, get, create, update, delete) — maps to Appointment objects
 *   Notes (list, get, create, update, delete)       — maps to Todo objects
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unverified: deal     — CAS genesisWorld REST API v7 Swagger spec requires an
 *                        authenticated instance; demo.cas.de returns only a bare
 *                        ReDoc shell with no endpoint listings. Prior adapter
 *                        comment asserts no native deal/opportunity object exists.
 * Unverified: pipeline — Same access blocker as deal; no pipeline concept could
 *                        be confirmed or denied from publicly reachable docs.
 *
 * ── Webhooks ─────────────────────────────────────────────────────────────────
 *   CAS genesisWorld v7 REST API does not expose a documented webhook /
 *   push-notification endpoint. No webhook support is implemented.
 */

import { customForm } from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { CasGenesisworldClient } from './client'
import { DEFAULT_PAGE_SIZE, FILTER_CONTACT, FILTER_COMPANY } from './constants'
import {
  transformContact,
  untransformContact,
  type RawCasAddress,
} from './transform/contact'
import { transformCompany, untransformCompany } from './transform/company'
import {
  transformActivity,
  untransformActivity,
  type RawCasAppointment,
} from './transform/activity'
import {
  transformNote,
  untransformNote,
  type RawCasTodo,
} from './transform/note'

// ── Credential form ────────────────────────────────────────────────────────

const FORM = customForm({
  fields: [
    {
      name: 'serverUrl',
      label: 'Server URL',
      type: 'text',
      placeholder: 'https://your-instance.example.com/genesisrest.svc',
      helpText: 'The base URL of your CAS genesisWorld REST service.',
      required: true,
    },
    {
      name: 'username',
      label: 'Username',
      type: 'text',
      placeholder: 'admin',
      required: true,
    },
    {
      name: 'apiKey',
      label: 'API key / Password',
      type: 'password',
      helpText: 'Your CAS genesisWorld user password or API key.',
      required: true,
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const serverUrl = (fields['serverUrl'] ?? '').trim().replace(/\/+$/, '')
    const username = (fields['username'] ?? '').trim()
    const apiKey = fields['apiKey'] ?? ''
    if (!serverUrl) throw new Error('Server URL is required.')
    if (!username) throw new Error('Username is required.')
    if (!apiKey) throw new Error('API key / Password is required.')
    return {
      accessToken: username,
      refreshToken: apiKey,
      extra: { serverUrl },
    }
  },
})

// ── Adapter ────────────────────────────────────────────────────────────────

export class CasGenesisworldAdapter implements CrmAdapter {
  readonly platform = 'cas-genesisworld'
  readonly version = '0.1.0'

  credentialFields = FORM.credentialFields
  exchangeCredentials = FORM.exchangeCredentials

  // ── Auth ─────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // CAS genesisWorld uses username + API key, not OAuth2.
    return ''
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('CAS genesisWorld does not support OAuth2 authorization code flow.')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Basic auth credentials do not expire.
    return credentials
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): CasGenesisworldClient {
    return new CasGenesisworldClient(credentials)
  }

  private pageParams(params: QueryParams): { page: number; 'entries-per-page': number } {
    return {
      page: Math.max(1, Number(params['page'] ?? 1)),
      'entries-per-page': Number(params.limit ?? DEFAULT_PAGE_SIZE),
    }
  }

  // ── Contacts ──────────────────────────────────────────────────────────────
  // Contacts are Address objects with GWISCONTACT='true'.

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = this.client(credentials)
    const pp = this.pageParams(params)
    const { items } = await client.list<RawCasAddress>('/type/address', {
      filter: FILTER_CONTACT,
      ...pp,
    })
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawCasAddress>(`/type/address/${id}`)
    if (!raw?.GWGUID) {
      throw Object.assign(
        new Error(`CAS genesisWorld: contact ${id} not found`),
        { statusCode: 404 },
      )
    }
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).post<RawCasAddress>('/type/address', body)
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const body = { ...untransformContact(data), GWGUID: id }
    const raw = await this.client(credentials).put<RawCasAddress>(`/type/address/${id}`, body)
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/type/address/${id}`)
  }

  // ── Companies ─────────────────────────────────────────────────────────────
  // Companies are Address objects with GWISCOMPANY='true'.

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const client = this.client(credentials)
    const pp = this.pageParams(params)
    const { items } = await client.list<RawCasAddress>('/type/address', {
      filter: FILTER_COMPANY,
      ...pp,
    })
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawCasAddress>(`/type/address/${id}`)
    if (!raw?.GWGUID) {
      throw Object.assign(
        new Error(`CAS genesisWorld: company ${id} not found`),
        { statusCode: 404 },
      )
    }
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const raw = await this.client(credentials).post<RawCasAddress>('/type/address', body)
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const body = { ...untransformCompany(data), GWGUID: id }
    const raw = await this.client(credentials).put<RawCasAddress>(`/type/address/${id}`, body)
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/type/address/${id}`)
  }

  // ── Activities ────────────────────────────────────────────────────────────
  // Activities map to Appointment objects.

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const client = this.client(credentials)
    const pp = this.pageParams(params)
    const { items } = await client.list<RawCasAppointment>('/type/appointment', pp)
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).get<RawCasAppointment>(
      `/type/appointment/${id}`,
    )
    if (!raw?.GWGUID) {
      throw Object.assign(
        new Error(`CAS genesisWorld: activity ${id} not found`),
        { statusCode: 404 },
      )
    }
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const raw = await this.client(credentials).post<RawCasAppointment>(
      '/type/appointment',
      body,
    )
    return transformActivity(raw)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const body = { ...untransformActivity(data), GWGUID: id }
    const raw = await this.client(credentials).put<RawCasAppointment>(
      `/type/appointment/${id}`,
      body,
    )
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/type/appointment/${id}`)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────
  // Notes map to Todo objects.

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const client = this.client(credentials)
    const pp = this.pageParams(params)
    const { items } = await client.list<RawCasTodo>('/type/todo', pp)
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.client(credentials).get<RawCasTodo>(`/type/todo/${id}`)
    if (!raw?.GWGUID) {
      throw Object.assign(
        new Error(`CAS genesisWorld: note ${id} not found`),
        { statusCode: 404 },
      )
    }
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const raw = await this.client(credentials).post<RawCasTodo>('/type/todo', body)
    return transformNote(raw)
  }

  async updateNote(
    credentials: Credentials,
    id: string,
    data: Partial<Note>,
  ): Promise<Note> {
    const body = { ...untransformNote(data), GWGUID: id }
    const raw = await this.client(credentials).put<RawCasTodo>(`/type/todo/${id}`, body)
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/type/todo/${id}`)
  }
}
