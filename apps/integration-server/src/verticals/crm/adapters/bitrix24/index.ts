/**
 * Bitrix24 adapter for the CRM vertical.
 *
 * Platform: Bitrix24
 * API version: REST API (method-based)
 * Docs: https://apidocs.bitrix24.com/api-reference/crm/
 *
 * Coverage:
 *   - Contacts (list, get, create, update, delete)
 *   - Companies (list, get, create, update, delete)
 *   - Deals (list, get, create, update, delete)
 *   - Pipelines / deal funnels (list, get — with stages)
 *   - Activities (list, get, create, update, delete)
 *   - Notes — not supported (Bitrix24 has no standalone notes resource); all note
 *             methods return 501 via the adapter registry
 *   - Webhooks — HMAC-SHA1 verification
 *
 * Auth note:
 *   The portal REST address must be stored in `credentials.extra.baseUrl`. The
 *   OAuth token exchange sets it from the `client_endpoint` field returned by
 *   Bitrix24 (e.g. https://mycompany.bitrix24.com/rest/). For manual connections
 *   set it explicitly; a bare portal address (https://mycompany.bitrix24.com)
 *   also works (see client.ts).
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'

import { connectionScope, cursorPagerKey, pageByRows } from '@opensteward/shared'

import { Bitrix24Client } from './client'
import {
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  refreshCredentials as doRefresh,
} from './auth'
import { verifyBitrix24Webhook, parseBitrix24WebhookEvents } from './webhook'
import {
  BITRIX24_OAUTH_AUTH_URL,
  BITRIX24_DEFAULT_PAGE_SIZE,
  BITRIX24_DEAL_ENTITY_TYPE_ID,
} from './constants'
import { transformContact, untransformContact, type RawBitrix24Contact } from './transform/contact'
import { transformCompany, untransformCompany, type RawBitrix24Company } from './transform/company'
import { transformDeal, untransformDeal, type RawBitrix24Deal } from './transform/deal'
import {
  transformPipeline,
  type RawBitrix24Category,
  type RawBitrix24Stage,
} from './transform/pipeline'
import {
  transformActivity,
  untransformActivity,
  type RawBitrix24Activity,
} from './transform/activity'

export interface Bitrix24AdapterConfig {
  /** OAuth2 client ID. */
  clientId?: string
  /** OAuth2 client secret. */
  clientSecret?: string
  /** OAuth2 redirect URI. */
  redirectUri?: string
}

export class Bitrix24Adapter implements CrmAdapter {
  readonly platform = 'bitrix24'
  readonly version = '0.1.0'

  private clientId: string | undefined
  private clientSecret: string | undefined
  private redirectUri: string | undefined

  constructor(config: Bitrix24AdapterConfig = {}) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, _overrideScopes?: string[]): string {
    if (!this.clientId || !this.redirectUri) {
      const url = new URL(BITRIX24_OAUTH_AUTH_URL)
      url.searchParams.set('state', state)
      return url.toString()
    }
    return buildAuthUrl(
      {
        clientId: this.clientId,
        clientSecret: this.clientSecret ?? '',
        redirectUri: this.redirectUri,
      },
      state,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Bitrix24 exchangeCode: clientId and clientSecret required')
    }
    return doExchangeCode(
      {
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        redirectUri: this.redirectUri ?? redirectUri,
      },
      code,
      redirectUri,
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    const creds: Credentials = {
      ...credentials,
      extra: {
        clientId: this.clientId ?? credentials.extra?.['clientId'],
        clientSecret: this.clientSecret ?? credentials.extra?.['clientSecret'],
        ...credentials.extra,
      },
    }
    return doRefresh(creds)
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyBitrix24Webhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseBitrix24WebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): Bitrix24Client {
    return new Bitrix24Client(credentials)
  }

  /**
   * The caller's page of a `crm.*.list` method.
   *
   * Bitrix24 list methods take only `start`, and answer a fixed 50 rows: "The
   * page size of results is always static — 50 records." The response's
   * `next` "Contains the value to be passed in the next request in the start
   * parameter to get the next batch of data", and is absent on the last page
   * (https://apidocs.bitrix24.com/api-reference/crm/contacts/crm-contact-list.html).
   * With no size parameter, one upstream page is not one caller page, so the
   * row pager walks the 50-row pages and cuts the caller's rows out of them.
   */
  private async pageList<R, T>(
    credentials: Credentials,
    params: QueryParams,
    method: string,
    transform: (raw: R) => T,
  ): Promise<T[]> {
    const portal = String(credentials.extra?.['baseUrl'] ?? 'bitrix24')
    const body = { filter: {}, select: ['*'] }
    const key = cursorPagerKey(connectionScope(portal, credentials), method, {
      ...body,
      upstreamPageSize: BITRIX24_DEFAULT_PAGE_SIZE,
    })
    const { items } = await pageByRows<T, number>(
      key,
      params,
      async (start) => {
        const res = await this.client(credentials).list<R>(method, { start: start ?? 0, ...body })
        return { items: res.items.map(transform), next: res.nextStart ?? null }
      },
      { defaultLimit: BITRIX24_DEFAULT_PAGE_SIZE },
    )
    return items
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    return this.pageList<RawBitrix24Contact, Contact>(
      credentials,
      params,
      'crm.contact.list',
      transformContact,
    )
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawBitrix24Contact>('crm.contact.get', { id })
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const fields = untransformContact(data)
    const newId = await this.client(credentials).add('crm.contact.add', fields)
    return this.getContact(credentials, newId)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const fields = untransformContact(data)
    await this.client(credentials).update('crm.contact.update', id, fields)
    return this.getContact(credentials, id)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('crm.contact.delete', id)
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    return this.pageList<RawBitrix24Company, Company>(
      credentials,
      params,
      'crm.company.list',
      transformCompany,
    )
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawBitrix24Company>('crm.company.get', { id })
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const fields = untransformCompany(data)
    const newId = await this.client(credentials).add('crm.company.add', fields)
    return this.getCompany(credentials, newId)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const fields = untransformCompany(data)
    await this.client(credentials).update('crm.company.update', id, fields)
    return this.getCompany(credentials, id)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('crm.company.delete', id)
  }

  // ── Deals ─────────────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    return this.pageList<RawBitrix24Deal, Deal>(credentials, params, 'crm.deal.list', transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawBitrix24Deal>('crm.deal.get', { id })
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const fields = untransformDeal(data)
    const newId = await this.client(credentials).add('crm.deal.add', fields)
    return this.getDeal(credentials, newId)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const fields = untransformDeal(data)
    await this.client(credentials).update('crm.deal.update', id, fields)
    return this.getDeal(credentials, id)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('crm.deal.delete', id)
  }

  // ── Pipelines (deal funnels) ──────────────────────────────────────────────

  /**
   * Deal funnels, from `crm.category.list` with `entityTypeId` 2: "The method
   * retrieves a list of sales funnels (directions) that belong to the CRM
   * object type with the identifier entityTypeId", and its documented example
   * includes the default funnel (`"id": 0, "name": "General", … "isDefault": "Y"`)
   * (https://apidocs.bitrix24.com/api-reference/crm/universal/category/crm-category-list.html).
   * The rows sit in `result.categories`. It is a list method, paged like the
   * others by `start` and `next` over pages of at most 50
   * (https://apidocs.bitrix24.com/settings/how-to-call-rest-api/list-methods-pecularities.html).
   * The method's own page sends `start` in its SDK example (`params : {
   * entityTypeId : 2 , start : 0 }`, "crm.category.list returns a single page
   * (max 50 records)").
   *
   * Stages are read one funnel at a time, not concurrently, so a page of up to
   * the router maximum does not fire that many requests at the portal at once.
   *
   * The adapter used to read `crm.dealcategory.list`, whose rows omit the
   * default funnel, and asked for stages with `crm.dealcategory.stages`, a
   * method no Bitrix24 page documents.
   */
  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const portal = String(credentials.extra?.['baseUrl'] ?? 'bitrix24')
    const body = { entityTypeId: BITRIX24_DEAL_ENTITY_TYPE_ID }
    const key = cursorPagerKey(connectionScope(portal, credentials), 'crm.category.list', {
      ...body,
      upstreamPageSize: BITRIX24_DEFAULT_PAGE_SIZE,
    })
    const { items } = await pageByRows<RawBitrix24Category, number>(
      key,
      params,
      async (start) => {
        const res = await this.client(credentials).listIn<
          { categories: RawBitrix24Category[] },
          RawBitrix24Category
        >('crm.category.list', { ...body, start: start ?? 0 }, (r) => r.categories)
        return { items: res.items, next: res.nextStart ?? null }
      },
      { defaultLimit: BITRIX24_DEFAULT_PAGE_SIZE },
    )
    const out: Pipeline[] = []
    for (const cat of items) {
      out.push(transformPipeline(cat, await this.stagesOf(credentials, cat.id)))
    }
    return out
  }

  /**
   * One deal funnel, from `crm.category.get`: `entityTypeId`* and `id`*, answering
   * `{ "result": { "category": { "id": 1, "name": "New funnel #1", … } } }`
   * (https://apidocs.bitrix24.com/api-reference/crm/universal/category/crm-category-get.html).
   * `id` is documented as "id* integer", and the OAuth example sends `"id":1`,
   * so a non-integer id names no funnel.
   */
  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    if (!/^\d+$/.test(id)) {
      throw Object.assign(new Error(`Bitrix24: pipeline ${id} not found`), { statusCode: 404 })
    }
    const { category } = await this.client(credentials).get<{ category: RawBitrix24Category }>(
      'crm.category.get',
      { entityTypeId: BITRIX24_DEAL_ENTITY_TYPE_ID, id: Number(id) },
    )
    return transformPipeline(category, await this.stagesOf(credentials, category.id))
  }

  /**
   * A deal funnel's stages, from `crm.dealcategory.stage.list`: "This method
   * returns a list of deal stages for the direction specified by the
   * identifier", and "If id = 0 or nothing is specified, it will return the
   * statuses of the "default" direction"
   * (https://apidocs.bitrix24.com/api-reference/crm/outdated/category-old/crm-deal-category-stage-list.html).
   * Every page is read, following `next` until it is absent.
   */
  private async stagesOf(credentials: Credentials, id: number): Promise<RawBitrix24Stage[]> {
    const stages: RawBitrix24Stage[] = []
    let start: number | undefined
    do {
      const res = await this.client(credentials).list<RawBitrix24Stage>(
        'crm.dealcategory.stage.list',
        start === undefined ? { id } : { id, start },
      )
      stages.push(...res.items)
      if (res.nextStart !== undefined && res.nextStart === start) {
        throw new Error('Bitrix24 crm.dealcategory.stage.list named its own start as next')
      }
      start = res.nextStart
    } while (start !== undefined)
    return stages
  }

  // ── Activities ────────────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    return this.pageList<RawBitrix24Activity, Activity>(
      credentials,
      params,
      'crm.activity.list',
      transformActivity,
    )
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).get<RawBitrix24Activity>('crm.activity.get', { id })
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const fields = untransformActivity(data)
    const newId = await this.client(credentials).add('crm.activity.add', fields)
    return this.getActivity(credentials, newId)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const fields = untransformActivity(data)
    await this.client(credentials).update('crm.activity.update', id, fields)
    return this.getActivity(credentials, id)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete('crm.activity.delete', id)
  }

  // Notes: Bitrix24 has no standalone notes resource — not implemented.
  // The adapter registry will return 501 for all note methods.
}
