/**
 * CentralStationCRM adapter for the CRM vertical.
 *
 * Maps the CentralStationCRM REST API to canonical CRM resources.
 * Docs: https://centralstationcrm.com/api-basics
 *       https://api.centralstationcrm.net/api-docs/index.html
 *
 * ── Auth ─────────────────────────────────────────────────────────────────
 *   API key in the X-apikey header on every request.
 *   The account slug is part of the base URL:
 *     https://{account}.centralstationcrm.net/api
 *
 *   credentials.accessToken  = API key
 *   credentials.extra.accountName = account slug (e.g. "mycompany")
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (14 methods across 6 resources):
 *   Contacts (People):       list, get, create, update, delete
 *   Companies:               list, get, create, update, delete
 *   Notes (Protocols):       list, get, create
 *   Activities (Tasks):      list, get, create
 *   Deals:                   list, get, create, update
 *   Pipelines (DealTypes):   list, get
 *
 * ── Resource coverage ──────────────────────────────────────────────────
 * All 6 canonical CRM resources are available for this adapter.
 */

import { customForm } from '@opensteward/shared'
import type { CredentialField } from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Note } from '../../schema/note'
import type { Activity } from '../../schema/activity'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'

import { CentralStationCrmClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import {
  transformContact,
  untransformContact,
  type RawCentralStationPerson,
  type RawCentralStationPersonWrapper,
} from './transform/contact'
import {
  transformCompany,
  untransformCompany,
  type RawCentralStationCompany,
  type RawCentralStationCompanyWrapper,
} from './transform/company'
import {
  transformNote,
  untransformNote,
  type RawCentralStationProtocol,
  type RawCentralStationProtocolWrapper,
} from './transform/note'
import {
  transformActivity,
  untransformActivity,
  type RawCentralStationTask,
  type RawCentralStationTaskWrapper,
} from './transform/activity'
import {
  transformDeal,
  untransformDeal,
  type RawCentralStationDeal,
  type RawCentralStationDealWrapper,
} from './transform/deal'
import {
  transformPipeline,
  type RawCentralStationDealType,
  type RawCentralStationDealTypeWrapper,
} from './transform/pipeline'

// ── Credential form ───────────────────────────────────────────────────────────

const CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'accountName',
    label: 'Account name',
    type: 'text',
    placeholder: 'mycompany',
    helpText: 'The subdomain of your CentralStationCRM account (e.g. "mycompany" from mycompany.centralstationcrm.net).',
    required: true,
  },
  {
    name: 'apiKey',
    label: 'API key',
    type: 'password',
    helpText: 'Found under My Settings → API token in your CentralStationCRM account.',
    required: true,
  },
]

const CREDENTIAL_FORM = customForm({
  fields: CREDENTIAL_FIELDS,
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const accountName = (fields['accountName'] ?? '').trim()
    const apiKey = (fields['apiKey'] ?? '').trim()
    if (!accountName) throw new Error('Account name is required.')
    if (!apiKey) throw new Error('API key is required.')
    return {
      accessToken: apiKey,
      extra: { accountName },
    }
  },
})

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Unwrap a list response — API returns `[{ person: {...} }, ...]`. */
function unwrapList<W, T>(items: W[], key: string): T[] {
  return (items as Array<Record<string, unknown>>).map((w) => w[key] as T)
}

export class CentralstationcrmAdapter implements CrmAdapter {
  readonly platform = 'centralstationcrm'
  readonly version = '0.1.0'

  // Connect Link support — two-field form (account name + API key).
  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // CentralStationCRM uses API key, not OAuth2.
    return ''
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    // Not used for API key auth — placeholder to satisfy interface.
    return { accessToken: '' }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ��─ Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): CentralStationCrmClient {
    return new CentralStationCrmClient(credentials)
  }

  private pageParams(params: QueryParams): { page: number; perpage: number } {
    return {
      page: Number(params['page'] ?? 1),
      perpage: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 250),
    }
  }

  // ── Contacts (People) ──────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const { page, perpage } = this.pageParams(params)
    const raw = await this.client(credentials).get<RawCentralStationPersonWrapper[]>(
      '/people.json',
      { page, perpage, includes: 'contact_details companies tags' },
    )
    return unwrapList<RawCentralStationPersonWrapper, RawCentralStationPerson>(raw ?? [], 'person')
      .map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const wrapper = await this.client(credentials).get<RawCentralStationPersonWrapper>(
      `/people/${id}.json`,
      { includes: 'contact_details companies tags' },
    )
    if (!wrapper?.person) {
      throw Object.assign(new Error(`CentralStationCRM: contact ${id} not found`), { statusCode: 404 })
    }
    return transformContact(wrapper.person)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const wrapper = await this.client(credentials).post<RawCentralStationPersonWrapper>(
      '/people.json',
      body,
    )
    return transformContact(wrapper.person)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const wrapper = await this.client(credentials).put<RawCentralStationPersonWrapper>(
      `/people/${id}.json`,
      body,
    )
    return transformContact(wrapper.person)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/people/${id}.json`)
  }

  // ── Companies ──────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const { page, perpage } = this.pageParams(params)
    const raw = await this.client(credentials).get<RawCentralStationCompanyWrapper[]>(
      '/companies.json',
      { page, perpage, includes: 'contact_details tags' },
    )
    return unwrapList<RawCentralStationCompanyWrapper, RawCentralStationCompany>(raw ?? [], 'company')
      .map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const wrapper = await this.client(credentials).get<RawCentralStationCompanyWrapper>(
      `/companies/${id}.json`,
      { includes: 'contact_details tags' },
    )
    if (!wrapper?.company) {
      throw Object.assign(new Error(`CentralStationCRM: company ${id} not found`), { statusCode: 404 })
    }
    return transformCompany(wrapper.company)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const wrapper = await this.client(credentials).post<RawCentralStationCompanyWrapper>(
      '/companies.json',
      body,
    )
    return transformCompany(wrapper.company)
  }

  async updateCompany(credentials: Credentials, id: string, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const wrapper = await this.client(credentials).put<RawCentralStationCompanyWrapper>(
      `/companies/${id}.json`,
      body,
    )
    return transformCompany(wrapper.company)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/companies/${id}.json`)
  }

  // ── Notes (Protocols) ──────────────────────────────────────────────────────
  // Protocols are attached to a person or company. List is fetched globally.

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const { page, perpage } = this.pageParams(params)
    const raw = await this.client(credentials).get<RawCentralStationProtocolWrapper[]>(
      '/protocols.json',
      { page, perpage },
    )
    return unwrapList<RawCentralStationProtocolWrapper, RawCentralStationProtocol>(raw ?? [], 'protocol')
      .map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const wrapper = await this.client(credentials).get<RawCentralStationProtocolWrapper>(
      `/protocols/${id}.json`,
    )
    if (!wrapper?.protocol) {
      throw Object.assign(new Error(`CentralStationCRM: note ${id} not found`), { statusCode: 404 })
    }
    return transformNote(wrapper.protocol)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    // Create on the appropriate parent resource if available
    let path = '/protocols.json'
    if (data.contact_id) {
      path = `/people/${data.contact_id}/protocols.json`
    } else if (data.company_id) {
      path = `/companies/${data.company_id}/protocols.json`
    }
    const wrapper = await this.client(credentials).post<RawCentralStationProtocolWrapper>(
      path,
      body,
    )
    return transformNote(wrapper.protocol)
  }

  // ── Activities (Tasks) ─────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const { page, perpage } = this.pageParams(params)
    const raw = await this.client(credentials).get<RawCentralStationTaskWrapper[]>(
      '/tasks.json',
      { page, perpage },
    )
    return unwrapList<RawCentralStationTaskWrapper, RawCentralStationTask>(raw ?? [], 'task')
      .map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const wrapper = await this.client(credentials).get<RawCentralStationTaskWrapper>(
      `/tasks/${id}.json`,
    )
    if (!wrapper?.task) {
      throw Object.assign(new Error(`CentralStationCRM: activity ${id} not found`), { statusCode: 404 })
    }
    return transformActivity(wrapper.task)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    let path = '/tasks.json'
    if (data.contact_id) {
      path = `/people/${data.contact_id}/tasks.json`
    } else if (data.company_id) {
      path = `/companies/${data.company_id}/tasks.json`
    }
    const wrapper = await this.client(credentials).post<RawCentralStationTaskWrapper>(
      path,
      body,
    )
    return transformActivity(wrapper.task)
  }

  // ── Deals ──────────────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const { page, perpage } = this.pageParams(params)
    const raw = await this.client(credentials).get<RawCentralStationDealWrapper[]>(
      '/deals.json',
      { page, perpage, includes: 'companies contact_details' },
    )
    return unwrapList<RawCentralStationDealWrapper, RawCentralStationDeal>(raw ?? [], 'deal')
      .map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const wrapper = await this.client(credentials).get<RawCentralStationDealWrapper>(
      `/deals/${id}.json`,
      { includes: 'companies contact_details' },
    )
    if (!wrapper?.deal) {
      throw Object.assign(new Error(`CentralStationCRM: deal ${id} not found`), { statusCode: 404 })
    }
    return transformDeal(wrapper.deal)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const wrapper = await this.client(credentials).post<RawCentralStationDealWrapper>(
      '/deals.json',
      body,
    )
    return transformDeal(wrapper.deal)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const wrapper = await this.client(credentials).put<RawCentralStationDealWrapper>(
      `/deals/${id}.json`,
      body,
    )
    return transformDeal(wrapper.deal)
  }

  // ── Pipelines (DealTypes) ──────────────────────────────────────────────────
  // CentralStationCRM models pipelines as "deal types" (GET /deal_types.json).
  // Each deal type includes its ordered stages (deal_type_stages).

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const { page, perpage } = this.pageParams(params)
    const raw = await this.client(credentials).get<RawCentralStationDealTypeWrapper[]>(
      '/deal_types.json',
      { page, perpage },
    )
    return unwrapList<RawCentralStationDealTypeWrapper, RawCentralStationDealType>(raw ?? [], 'deal_type')
      .map(transformPipeline)
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const wrapper = await this.client(credentials).get<RawCentralStationDealTypeWrapper>(
      `/deal_types/${id}.json`,
    )
    if (!wrapper?.deal_type) {
      throw Object.assign(new Error(`CentralStationCRM: pipeline ${id} not found`), { statusCode: 404 })
    }
    return transformPipeline(wrapper.deal_type)
  }
}
