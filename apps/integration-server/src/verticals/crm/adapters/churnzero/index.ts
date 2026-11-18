/**
 * ChurnZero adapter for the CRM vertical.
 *
 * Maps the ChurnZero REST API (OData v4) to canonical CRM resources.
 * Docs: https://app.churnzero.net/developers
 *
 * ── Auth ─────────────────────────────────────────────────────────────────
 *   HTTP Basic Authentication: Authorization: Basic <base64(username:apikey)>
 *   API keys are generated at Admin > API Keys. The "Developer Tools" user
 *   permission must be granted on the account.
 *
 *   Because each ChurnZero customer has a unique instance subdomain, the
 *   form collects three fields:
 *     instanceUrl  — e.g. https://mycompany.us1app.churnzero.net/public/v1
 *     username     — ChurnZero username (email)
 *     apiKey       — API key from Admin > API Keys
 *
 *   credentials.accessToken  = base64(username:apikey)
 *   credentials.extra.baseUrl = instanceUrl (stored for per-request use)
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (7):
 *   Contacts  : list, get
 *   Companies : list, get, create, update
 *   Activities: list, get
 *
 * Omitted — registry returns HTTP 501 automatically:
 *   Deals     — ChurnZero has no native Deal/opportunity entity
 *   Pipelines — ChurnZero has no sales pipeline concept
 *   Notes     — no dedicated Note entity in the REST API
 *   Webhooks  — no outbound webhook support documented
 */

import { customForm } from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Activity } from '../../schema/activity'

import { ChurnZeroClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import {
  transformContact,
  type RawChurnZeroContact,
} from './transform/contact'
import {
  transformCompany,
  untransformCompany,
  type RawChurnZeroAccount,
} from './transform/company'
import {
  transformActivity,
  type RawChurnZeroTask,
} from './transform/activity'

// ── Credential form ────────────────────────────────────────────────────────────

const CRED_FORM = customForm({
  fields: [
    {
      name: 'instanceUrl',
      label: 'Instance URL',
      type: 'url',
      placeholder: 'https://mycompany.us1app.churnzero.net/public/v1',
      helpText: 'Your ChurnZero subdomain URL including /public/v1. Ask your admin or check Admin > API Keys.',
      required: true,
    },
    {
      name: 'username',
      label: 'Username',
      type: 'text',
      placeholder: 'admin@example.com',
      helpText: 'ChurnZero account username (email). The account must have the Developer Tools permission.',
      required: true,
    },
    {
      name: 'apiKey',
      label: 'API key',
      type: 'password',
      placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      helpText: 'Generate at Admin > API Keys in ChurnZero.',
      required: true,
    },
  ],
  exchange: async (fields: Record<string, string>): Promise<Credentials> => {
    const instanceUrl = (fields['instanceUrl'] ?? '').trim().replace(/\/$/, '')
    const username = (fields['username'] ?? '').trim()
    const apiKey = (fields['apiKey'] ?? '').trim()
    if (!instanceUrl) throw new Error('Instance URL is required.')
    if (!username) throw new Error('Username is required.')
    if (!apiKey) throw new Error('API key is required.')
    const basicToken = Buffer.from(`${username}:${apiKey}`).toString('base64')
    return {
      accessToken: basicToken,
      extra: { baseUrl: instanceUrl },
    }
  },
})

// ── Adapter ────────────────────────────────────────────────────────────────────

export class ChurnzeroAdapter implements CrmAdapter {

  // Connect Link support — three-field form (instanceUrl + username + apiKey).
  credentialFields = CRED_FORM.credentialFields
  exchangeCredentials = CRED_FORM.exchangeCredentials

  readonly platform = 'churnzero'
  readonly version = '0.1.0'

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // ChurnZero uses API key + HTTP Basic, not OAuth2.
    return ''
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('ChurnZero does not support OAuth2 authorization code flow. Use exchangeCredentials instead.')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys do not expire; return as-is.
    return credentials
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): ChurnZeroClient {
    return new ChurnZeroClient(credentials)
  }

  private skipFromParams(params: QueryParams): number {
    const page = Number(params['page'] ?? 1)
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    return Math.max(0, (page - 1) * limit)
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const top = params.limit ?? DEFAULT_PAGE_SIZE
    const skip = this.skipFromParams(params)
    const { items } = await this.client(credentials).list<RawChurnZeroContact>(
      '/Contact',
      skip,
      top,
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawChurnZeroContact>(`/Contact(${id})`)
    return transformContact(raw)
  }

  // ── Companies (ChurnZero: Account) ─────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const top = params.limit ?? DEFAULT_PAGE_SIZE
    const skip = this.skipFromParams(params)
    const { items } = await this.client(credentials).list<RawChurnZeroAccount>(
      '/Account',
      skip,
      top,
    )
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawChurnZeroAccount>(`/Account(${id})`)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const raw = await this.client(credentials).post<RawChurnZeroAccount>('/Account', body)
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const body = untransformCompany(data)
    const raw = await this.client(credentials).patch<RawChurnZeroAccount>(`/Account(${id})`, body)
    return transformCompany(raw)
  }

  // ── Activities (ChurnZero: Task) ───────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const top = params.limit ?? DEFAULT_PAGE_SIZE
    const skip = this.skipFromParams(params)
    const { items } = await this.client(credentials).list<RawChurnZeroTask>(
      '/Task',
      skip,
      top,
    )
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).get<RawChurnZeroTask>(`/Task(${id})`)
    return transformActivity(raw)
  }
}
