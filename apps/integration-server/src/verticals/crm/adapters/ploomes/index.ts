import { pageOffset, reportUpstreamPage, simpleApiKey } from '@opensteward/shared'
/**
 * Ploomes CRM adapter for the CRM vertical.
 *
 * Maps the Ploomes REST API to canonical CRM resources.
 * Docs: https://developers.ploomes.com (spec: https://developers.ploomes.com/json/openapi.json)
 *
 * Collections are OData: "Always use OData query best practices: $top and
 * $skip for paging (try to limit pages up to 100 items)". The spec documents
 * no next link or count, so the only end signal is a page shorter than $top.
 * It documents no GET on Entity({Id}) either: one record is read through the
 * collection's documented `$filter` ("Id+eq+12345").
 *
 * Auth: Bearer token sent as `User-Key` header
 * Base URL: https://api2.ploomes.com
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { PloomesClient } from './client'
import { DEFAULT_PAGE_SIZE, TASKS_MAX_PAGE_SIZE } from './constants'
import {
  verifyWebhook as _verifyWebhook,
  parseWebhookEvents as _parseWebhookEvents,
} from './webhook'
import { transformContact, untransformContact, type RawPloomesContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawPloomesCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawPloomesDeal } from './transform/deal'
import { transformPipeline, type RawPloomesPipeline } from './transform/pipeline'
import {
  transformActivity,
  untransformActivity,
  type RawPloomesActivity,
} from './transform/activity'
import { transformNote, untransformNote, type RawPloomesNote } from './transform/note'

export interface PloomesAdapterConfig {
  apiKey?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()

export class PloomesAdapter implements CrmAdapter {
  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'ploomes'
  readonly version = '0.1.0'

  constructor(_config: PloomesAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return '#api-key-auth'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('Ploomes: use API key auth — set accessToken directly')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
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

  private c(creds: Credentials): PloomesClient {
    return new PloomesClient(creds)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      $top: Number(params['limit'] ?? DEFAULT_PAGE_SIZE),
      $skip: (Number(params['page'] ?? 1) - 1) * Number(params['limit'] ?? DEFAULT_PAGE_SIZE),
    }
  }

  /**
   * One caller page of an OData collection: `$top` is the caller's limit
   * (clamped to `max` where the docs give one), `$skip` the 1-based page's
   * offset at that size. Reports the clamped size when it is below the ask,
   * and `hasMore` from a short page, the only end signal the spec gives.
   */
  private async odataPage<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    extra: Record<string, string> = {},
    max?: number,
  ): Promise<T[]> {
    const raw = Number(params.limit)
    const asked = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : DEFAULT_PAGE_SIZE
    const size = max !== undefined ? Math.min(asked, max) : asked
    const { items } = await this.c(credentials).list<T>(path, {
      $top: size,
      $skip: pageOffset(params, size),
      // A stable order, so $skip lands on the same rows on every page.
      $orderby: 'Id',
      ...extra,
    })
    reportUpstreamPage(params, {
      hasMore: items.length >= size,
      ...(size < asked ? { pageSize: size } : {}),
    })
    return items
  }

  /** One record through the collection's documented `$filter=Id eq N`. */
  private async byId<T>(
    credentials: Credentials,
    path: string,
    id: string,
    extra: Record<string, string> = {},
  ): Promise<T> {
    if (!/^\d+$/.test(id)) {
      throw Object.assign(new Error(`Ploomes: ${path} ids are integers, got "${id}"`), {
        statusCode: 404,
      })
    }
    const { items } = await this.c(credentials).list<T>(path, { $filter: `Id eq ${id}`, ...extra })
    const item = items[0]
    if (item === undefined) {
      throw Object.assign(new Error(`Ploomes: not found — ${path} Id ${id}`), { statusCode: 404 })
    }
    return item
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const { items } = await this.c(credentials).list<RawPloomesContact>(
      '/Contacts',
      this.pageParams(params),
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.c(credentials).get<RawPloomesContact>(`/Contacts(${id})`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.c(credentials).post<RawPloomesContact>(
      '/Contacts',
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const raw = await this.c(credentials).patch<RawPloomesContact>(
      `/Contacts(${id})`,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/Contacts(${id})`)
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  //
  // The spec has no /Accounts path (/Account is the tenant's own account).
  // Companies are customers in /Contacts whose TypeId is "Customer type id,
  // which can be a person or company type customer", but the ids of those
  // types are only served by /Contacts@Types (Id, Name) and are documented
  // nowhere, so there is no documented filter that selects companies. Both
  // reads refuse before sending anything. The writes below still target the
  // undocumented /Accounts and are outside this change.

  async listCompanies(_credentials: Credentials, _params: QueryParams): Promise<Company[]> {
    throw companiesUnsupported('list companies')
  }

  async getCompany(_credentials: Credentials, _id: string): Promise<Company> {
    throw companiesUnsupported('read a company')
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.c(credentials).post<RawPloomesCompany>(
      '/Accounts',
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const raw = await this.c(credentials).patch<RawPloomesCompany>(
      `/Accounts(${id})`,
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/Accounts(${id})`)
  }

  // ── Deals ─────────────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const { items } = await this.c(credentials).list<RawPloomesDeal>(
      '/Deals',
      this.pageParams(params),
    )
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.c(credentials).get<RawPloomesDeal>(`/Deals(${id})`)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.c(credentials).post<RawPloomesDeal>('/Deals', untransformDeal(data))
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.c(credentials).patch<RawPloomesDeal>(
      `/Deals(${id})`,
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/Deals(${id})`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  //
  // GET /Deals@Pipelines: "Query the deals funnels." Its $expand takes
  // "Form, Stages, AllowedUsers, AllowedTeams, LossReasons,
  // AllowedDocumentTemplates". The 300-item cap does not name pipelines, so
  // none is applied. /Deals@Pipelines({Id}) documents only PATCH and DELETE.

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const items = await this.odataPage<RawPloomesPipeline>(
      credentials,
      '/Deals@Pipelines',
      params,
      {
        $expand: 'Stages',
      },
    )
    return items.map(transformPipeline)
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const raw = await this.byId<RawPloomesPipeline>(credentials, '/Deals@Pipelines', id, {
      $expand: 'Stages',
    })
    return transformPipeline(raw)
  }

  // ── Activities ────────────────────────────────────────────────────────────

  //
  // Tasks: GET /Tasks, "Query the account's tasks." The spec has no /Actions
  // path. "That limit is 300 items for the entities: Contacts, Deals, Cities,
  // Tasks, Orders e Quotes." The writes below still target the undocumented
  // /Actions and are outside this change.

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const items = await this.odataPage<RawPloomesActivity>(
      credentials,
      '/Tasks',
      params,
      {},
      TASKS_MAX_PAGE_SIZE,
    )
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.byId<RawPloomesActivity>(credentials, '/Tasks', id)
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const raw = await this.c(credentials).post<RawPloomesActivity>(
      '/Actions',
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const raw = await this.c(credentials).patch<RawPloomesActivity>(
      `/Actions(${id})`,
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/Actions(${id})`)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  //
  // Interaction records: GET /InteractionRecords, "Query account interaction
  // records." The spec has no /Notes path, and the 300-item cap does not name
  // interaction records. The writes below still target the undocumented
  // /Notes and are outside this change.

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const items = await this.odataPage<RawPloomesNote>(credentials, '/InteractionRecords', params)
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.byId<RawPloomesNote>(credentials, '/InteractionRecords', id)
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.c(credentials).post<RawPloomesNote>('/Notes', untransformNote(data))
    return transformNote(raw)
  }

  async updateNote(credentials: Credentials, id: string, data: Partial<Note>): Promise<Note> {
    const raw = await this.c(credentials).patch<RawPloomesNote>(
      `/Notes(${id})`,
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/Notes(${id})`)
  }
}

function companiesUnsupported(action: 'list companies' | 'read a company'): Error {
  return Object.assign(
    new Error(
      `Ploomes cannot ${action}: ` +
        'the API has no /Accounts collection, and companies are ' +
        '/Contacts rows whose TypeId is "Customer type id, which can be a person or company type ' +
        'customer", with no documented id for the company type',
    ),
    { statusCode: 501, code: 'NOT_SUPPORTED' },
  )
}
