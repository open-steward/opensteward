/**
 * Tribe CRM adapter for the CRM vertical.
 *
 * Maps the Tribe CRM OData v4 REST API to canonical CRM resources.
 * Docs: https://help.tribecrm.eu/en/articles/9565766-api-tribe-crm
 * Postman: https://www.postman.com/tribecrm/tribe-crm-api-public/
 *
 * ── Auth ─────────────────────────────────────────────────────────
 *   API key (OAuth2 access token) supplied as a Bearer token.
 *   credentials.accessToken = Bearer access token
 *
 *   Tokens are obtained externally via the OAuth2 client-credentials grant
 *   (POST https://auth.tribecrm.nl/oauth2/token with client_id + client_secret).
 *   For the Connect Link flow, the operator pastes the access token directly.
 *
 * ── Coverage ─────────────────────────────────────────────────
 *
 * Implemented (5 resources):
 *   Contacts   (Relation)                   -- list, get, create, update, delete
 *   Companies  (Organisation)               -- list, get, create, update, delete
 *   Deals      (Activity_SalesOpportunity)  -- list, get, create, update, delete
 *   Notes      (Activity_Note)              -- list, get, create
 *   Activities (Activity_Task)              -- list, get, create
 *
 * Omitted — registry returns HTTP 501 automatically:
 *   Pipelines — no standalone pipeline entity in the OData feed; pipeline
 *               context is embedded on opportunity records.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: pipeline — Tribe CRM has no standalone pipeline OData entity
 *   set; PipelineId/Phase/PhaseId are embedded fields on Activity_SalesOpportunity
 *   records and pipelines are managed only through the Configuration UI.
 */

import { simpleApiKey } from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Note } from '../../schema/note'
import type { Activity } from '../../schema/activity'

import { TribeCrmClient } from './client'
import {
  DEFAULT_PAGE_SIZE,
  PATH_RELATIONS,
  PATH_ORGANISATIONS,
  PATH_OPPORTUNITIES,
  PATH_NOTES,
  PATH_TASKS,
} from './constants'
import {
  transformContact,
  untransformContact,
  type RawTribeCrmRelation,
} from './transform/contact'
import {
  transformCompany,
  untransformCompany,
  type RawTribeCrmOrganisation,
} from './transform/company'
import {
  transformDeal,
  untransformDeal,
  type RawTribeCrmOpportunity,
} from './transform/deal'
import {
  transformNote,
  untransformNote,
  type RawTribeCrmNote,
} from './transform/note'
import {
  transformActivity,
  untransformActivity,
  type RawTribeCrmTask,
} from './transform/activity'

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'API access token',
  placeholder: 'Paste your Tribe CRM Bearer token here',
  helpText:
    'Generate a token via Configuration > Applications > API in your Tribe CRM environment.',
})

export class TribeCrmAdapter implements CrmAdapter {
  // ── Connect Link — API-key (Bearer token) form ─────────────────────────────────
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'tribe-crm'
  readonly version = '0.1.0'

  // ── Auth ─────────────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Tribe CRM uses Bearer token auth, not browser-redirect OAuth2.
    return ''
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // Caller supplies the token directly as code.
    return { accessToken: code }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Bearer tokens are refreshed outside this adapter; return as-is.
    return credentials
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private client(credentials: Credentials): TribeCrmClient {
    return new TribeCrmClient(credentials)
  }

  private skip(params: QueryParams): number {
    const page = Number(params['page'] ?? 1)
    const limit = Number(params.limit ?? DEFAULT_PAGE_SIZE)
    return (page - 1) * limit
  }

  // ── Contacts (Relation) ───────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const top = Number(params.limit ?? DEFAULT_PAGE_SIZE)
    const skip = this.skip(params)
    const raw = await this.client(credentials).list<RawTribeCrmRelation>(
      PATH_RELATIONS, top, skip,
    )
    return raw.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawTribeCrmRelation>(
      `${PATH_RELATIONS}(${id})`,
    )
    if (!raw) {
      throw Object.assign(new Error(`Tribe CRM: contact ${id} not found`), { statusCode: 404 })
    }
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).post<RawTribeCrmRelation>(PATH_RELATIONS, body)
    return transformContact(raw)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).patch<RawTribeCrmRelation>(
      `${PATH_RELATIONS}(${id})`, body,
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`${PATH_RELATIONS}(${id})`)
  }

  // ── Companies (Organisation) ──────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const top = Number(params.limit ?? DEFAULT_PAGE_SIZE)
    const skip = this.skip(params)
    const raw = await this.client(credentials).list<RawTribeCrmOrganisation>(
      PATH_ORGANISATIONS, top, skip,
    )
    return raw.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawTribeCrmOrganisation>(
      `${PATH_ORGANISATIONS}(${id})`,
    )
    if (!raw) {
      throw Object.assign(new Error(`Tribe CRM: company ${id} not found`), { statusCode: 404 })
    }
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const raw = await this.client(credentials).post<RawTribeCrmOrganisation>(PATH_ORGANISATIONS, body)
    return transformCompany(raw)
  }

  async updateCompany(credentials: Credentials, id: string, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const raw = await this.client(credentials).patch<RawTribeCrmOrganisation>(
      `${PATH_ORGANISATIONS}(${id})`, body,
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`${PATH_ORGANISATIONS}(${id})`)
  }

  // ── Deals (Activity_SalesOpportunity) ────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const top = Number(params.limit ?? DEFAULT_PAGE_SIZE)
    const skip = this.skip(params)
    const raw = await this.client(credentials).list<RawTribeCrmOpportunity>(
      PATH_OPPORTUNITIES, top, skip,
    )
    return raw.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawTribeCrmOpportunity>(
      `${PATH_OPPORTUNITIES}(${id})`,
    )
    if (!raw) {
      throw Object.assign(new Error(`Tribe CRM: deal ${id} not found`), { statusCode: 404 })
    }
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const raw = await this.client(credentials).post<RawTribeCrmOpportunity>(PATH_OPPORTUNITIES, body)
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const raw = await this.client(credentials).patch<RawTribeCrmOpportunity>(
      `${PATH_OPPORTUNITIES}(${id})`, body,
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`${PATH_OPPORTUNITIES}(${id})`)
  }

  // ── Notes (Activity_Note) ───────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const top = Number(params.limit ?? DEFAULT_PAGE_SIZE)
    const skip = this.skip(params)
    const raw = await this.client(credentials).list<RawTribeCrmNote>(
      PATH_NOTES, top, skip,
    )
    return raw.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.client(credentials).get<RawTribeCrmNote>(
      `${PATH_NOTES}(${id})`,
    )
    if (!raw) {
      throw Object.assign(new Error(`Tribe CRM: note ${id} not found`), { statusCode: 404 })
    }
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const raw = await this.client(credentials).post<RawTribeCrmNote>(PATH_NOTES, body)
    return transformNote(raw)
  }

  // ── Activities (Activity_Task) ──────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const top = Number(params.limit ?? DEFAULT_PAGE_SIZE)
    const skip = this.skip(params)
    const raw = await this.client(credentials).list<RawTribeCrmTask>(
      PATH_TASKS, top, skip,
    )
    return raw.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).get<RawTribeCrmTask>(
      `${PATH_TASKS}(${id})`,
    )
    if (!raw) {
      throw Object.assign(new Error(`Tribe CRM: activity ${id} not found`), { statusCode: 404 })
    }
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const raw = await this.client(credentials).post<RawTribeCrmTask>(PATH_TASKS, body)
    return transformActivity(raw)
  }
}
