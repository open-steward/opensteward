/**
 * Vitally adapter for the CRM vertical.
 *
 * Maps the Vitally REST API to canonical CRM resources.
 * Docs: https://docs.vitally.io/en/articles/9880649-rest-api-overview
 *
 * ── Auth ─────────────────────────────────────────────────────────────────
 *   API key passed as HTTP Basic auth (base64-encoded as the username).
 *   credentials.accessToken = Vitally API key
 *   credentials.extra?.subdomain = US subdomain (e.g. "acme")
 *   credentials.extra?.region    = "eu" to use the EU datacenter
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (8):
 *   Contacts  (Vitally Users)     : list, get, create
 *   Companies (Vitally Accounts)  : list, get, create
 *   Deals     (Vitally Conversations): list, get
 *   Pipelines (Vitally Organizations): list
 *   Notes                          : list, get, create
 *   Activities (Vitally Tasks)     : list, get, create
 *
 * Omitted — registry returns HTTP 501 automatically:
 *   updateContact, deleteContact, updateCompany, deleteCompany, deleteDeal,
 *   getPipeline, updateNote, deleteNote, updateActivity, deleteActivity
 */

import {
  customForm,
  pageByCursor,
  cursorPagerKey,
  connectionScope,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'
import type { WebhookEvent } from '../../schema/webhook'

import { VitallyClient } from './client'
import { MAX_PAGE_SIZE } from './constants'
import { verifyWebhook as _verifyWebhook, parseWebhookEvents as _parseWebhookEvents } from './webhook'
import {
  transformContact,
  untransformContact,
  type RawVitallyUser,
} from './transform/contact'
import {
  transformCompany,
  untransformCompany,
  type RawVitallyAccount,
} from './transform/company'
import {
  transformDeal,
  type RawVitallyConversation,
} from './transform/deal'
import {
  transformPipeline,
  type RawVitallyOrganization,
} from './transform/pipeline'
import {
  transformNote,
  untransformNote,
  type RawVitallyNote,
} from './transform/note'
import {
  transformActivity,
  untransformActivity,
  type RawVitallyTask,
} from './transform/activity'

// ── Credential form ──────────────────────────────────────────────────────────

const CRED_FORM = customForm({
  fields: [
    {
      name: 'apiKey',
      label: 'API key',
      type: 'password',
      placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      helpText: 'Generate at Settings → Integrations → REST API in Vitally.',
      required: true,
    },
    {
      name: 'subdomain',
      label: 'Subdomain',
      type: 'text',
      placeholder: 'yourcompany',
      helpText: 'Your Vitally subdomain (e.g. "yourcompany" from yourcompany.vitally.io). Leave blank for EU datacenter.',
      required: false,
    },
    {
      name: 'region',
      label: 'Region',
      type: 'text',
      placeholder: 'us',
      helpText: 'Enter "eu" for the EU datacenter. Leave blank or enter "us" for the default US datacenter.',
      required: false,
    },
  ],
  exchange: async (fields: Record<string, string>): Promise<Credentials> => {
    const apiKey = (fields['apiKey'] ?? '').trim()
    if (!apiKey) throw new Error('API key is required.')
    const subdomain = (fields['subdomain'] ?? '').trim()
    const region = (fields['region'] ?? '').trim().toLowerCase()
    return {
      accessToken: apiKey,
      extra: {
        subdomain: subdomain || undefined,
        region: region || undefined,
      },
    }
  },
})

// ── Adapter ──────────────────────────────────────────────────────────────────

export class VitallyAdapter implements CrmAdapter {

  // Connect Link support — API key + optional subdomain/region form.
  credentialFields = CRED_FORM.credentialFields
  exchangeCredentials = CRED_FORM.exchangeCredentials

  readonly platform = 'vitally'
  readonly version = '0.1.0'

  /** Documented: "The max/default is 100" on every list endpoint. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Vitally uses API key + Basic auth, not OAuth2.
    return ''
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('Vitally does not support OAuth2 authorization code flow. Use exchangeCredentials instead.')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys do not expire; return as-is.
    return credentials
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return _verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return _parseWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): VitallyClient {
    return new VitallyClient(credentials)
  }

  /**
   * One caller page of a cursor-paged Vitally collection. Every list endpoint
   * pages with `from` (the previous response's `next`) + `limit` ("The
   * max/default is 100"), and `next` is null on the last page, so upstream
   * page k IS caller page k at the size sent. The overview asks for
   * `sortBy=createdAt` on every request of a crawl, `from` requests included.
   * The scope is the resolved host plus a key fingerprint: EU connections all
   * share one host.
   */
  private async page<T>(credentials: Credentials, path: string, params: QueryParams): Promise<T[]> {
    const asked =
      typeof params.limit === 'number' && params.limit >= 1 ? Math.floor(params.limit) : MAX_PAGE_SIZE
    const limit = Math.min(asked, MAX_PAGE_SIZE)
    const sortBy = 'createdAt'
    const client = this.client(credentials)
    const key = cursorPagerKey(connectionScope(client.baseUrl, credentials), path, { limit, sortBy })
    const { items, hasMore } = await pageByCursor<T>(key, params.page, async (cursor) => {
      const res = await client.list<T>(path, { limit, sortBy, ...(cursor ? { from: cursor } : {}) })
      return { items: res.items, next: res.next ?? undefined }
    })
    reportUpstreamPage(params, { hasMore, pageSize: limit })
    return items
  }

  // ── Contacts (Vitally: Users) ──────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    return (await this.page<RawVitallyUser>(credentials, '/users', params)).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawVitallyUser>(`/users/${id}`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).post<RawVitallyUser>('/users', body)
    return transformContact(raw)
  }

  // ── Companies (Vitally: Accounts) ─────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    return (await this.page<RawVitallyAccount>(credentials, '/accounts', params)).map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawVitallyAccount>(`/accounts/${id}`)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const raw = await this.client(credentials).post<RawVitallyAccount>('/accounts', body)
    return transformCompany(raw)
  }

  // ── Deals (Vitally: Conversations) ────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    return (await this.page<RawVitallyConversation>(credentials, '/conversations', params)).map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawVitallyConversation>(`/conversations/${id}`)
    return transformDeal(raw)
  }

  // ── Pipelines (Vitally: Organizations) ────────────────────────────────────

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    return (await this.page<RawVitallyOrganization>(credentials, '/organizations', params)).map(transformPipeline)
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    return (await this.page<RawVitallyNote>(credentials, '/notes', params)).map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.client(credentials).get<RawVitallyNote>(`/notes/${id}`)
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    // noteDate is required by Vitally; default to now if not supplied.
    if (!body['noteDate']) body['noteDate'] = new Date().toISOString()
    // note field (body text) is required by Vitally.
    if (!body['note']) body['note'] = ''
    const raw = await this.client(credentials).post<RawVitallyNote>('/notes', body)
    return transformNote(raw)
  }

  // ── Activities (Vitally: Tasks) ────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    return (await this.page<RawVitallyTask>(credentials, '/tasks', params)).map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).get<RawVitallyTask>(`/tasks/${id}`)
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const raw = await this.client(credentials).post<RawVitallyTask>('/tasks', body)
    return transformActivity(raw)
  }
}
