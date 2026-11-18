import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  reportUpstreamPage,
} from '@opensteward/shared'
/**
 * Megaplan adapter for the CRM vertical.
 *
 * Maps the Megaplan API v3 to canonical CRM resources.
 * Docs: https://dev.megaplan.ru/apiv3/index.html, and the RAML every account
 * serves at /api/v3 (e.g. https://demo.megaplan.ru/api/v3/).
 *
 * ── Auth ─────────────────────────────────────────────────────────────────
 *   Bearer token in the Authorization header.
 *   credentials.accessToken = API v3 access token
 *   credentials.extra.baseUrl = account host, e.g. "https://acme.megaplan.ru"
 *   (collected by the Connect Link form in ./auth.ts)
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (3):
 *   Contacts: list, get, create
 *
 * Omitted — registry returns HTTP 501 automatically:
 *   Companies, Deals, Pipelines, Notes, Activities — not yet implemented
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { WebhookEvent } from '../../schema/webhook'

import { CREDENTIAL_FORM } from './auth'
import { MegaplanClient, type MegaplanListResponse, type MegaplanSingleResponse } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import {
  verifyWebhook as _verifyWebhook,
  parseWebhookEvents as _parseWebhookEvents,
} from './webhook'
import {
  CONTRACTOR_HUMAN,
  transformContact,
  untransformContact,
  type MegaplanEntityRef,
  type RawMegaplanContractor,
} from './transform/contact'

/**
 * Fields asked for on the list. "если запрошена коллекция сущностей, то в
 * ответ будут включены только базовые поля" (docs, Типы данных), and the list
 * takes `fields`, "Набор дополнительных полей, включённых в список", as the
 * first-party SDK's contractor/list.php does ('fields' => ['name',
 * 'firstName', 'lastName', 'type', 'responsibles', 'contactInfo']). Every
 * name here is a ContractorHuman property in the RAML.
 */
const LIST_FIELDS = [
  'firstName',
  'lastName',
  'name',
  'position',
  'company',
  'responsibles',
  'contactInfo',
  'tags',
  'timeCreated',
  'timeUpdated',
] as const

/** Where the next page starts: the last row's link entity, and rows served before it. */
interface ContractorCursor {
  after: Required<MegaplanEntityRef>
  seen: number
}

export class MegaplanAdapter implements CrmAdapter {
  // Connect Link support — account host + API token.

  credentialFields = CREDENTIAL_FORM.credentialFields

  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  readonly platform = 'megaplan'
  readonly version = '0.1.0'

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Megaplan uses Bearer token auth, not OAuth2.
    return ''
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    // Caller passes the token as code, and the tenant baseUrl as redirectUri.
    return {
      accessToken: code,
      refreshToken: redirectUri,
    }
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

  private client(credentials: Credentials): MegaplanClient {
    return new MegaplanClient(credentials)
  }

  // ── Contacts ──────────────────────────────────────────────────────────────
  // List: GET /api/v3/contractorHuman — RAML: "/contractorHuman: get:
  //   description: 'Получение списка клиентов'", queryParameters pageAfter
  //   ("Загрузить страницу, начиная с переданной сущности.", type BaseEntity),
  //   limit ("Сколько элементов включать в страницу.", integer) and fields
  //   ("Набор дополнительных полей, включённых в список").
  // Get:  GET /api/v3/contractor/{id} — first-party SDK
  //   examples/entityRequests/contractor/card.php: "$url = '/api/v3/contractor/'.$contractorCompanyId".

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = this.client(credentials)
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const key = cursorPagerKey(connectionScope(client.baseUrl, credentials), 'contractorHuman', {
      limit,
    })
    let totalCount: number | undefined
    const page = await pageByCursor<RawMegaplanContractor, ContractorCursor>(
      key,
      params.page,
      async (cursor) => {
        const query: Record<string, unknown> = { limit, fields: LIST_FIELDS }
        if (cursor) query['pageAfter'] = cursor.after
        const res = await client.get<MegaplanListResponse<RawMegaplanContractor>>(
          '/contractorHuman',
          query,
        )
        if (!Array.isArray(res.data))
          throw new Error('Megaplan /contractorHuman returned no data array')
        // The docs say pageAfter shows rows "начиная с переданного" (starting
        // from the passed entity), while the RAML has a separate pageWith
        // ("c наличием переданной сущности") and the SDK passes the previous
        // page's last row, which imply pageAfter excludes it. Unverified live,
        // so drop the passed row if it does come back: served once, counted once.
        const head = res.data[0]
        const rows =
          cursor && head?.id === cursor.after.id && head?.contentType === cursor.after.contentType
            ? res.data.slice(1)
            : res.data
        // "С пагинируемой коллекцией в metadata обязательно возвращается поле
        // pagination с полями: count — Общее количество сущностей по запросу".
        const count = res.meta?.pagination?.count
        if (typeof count !== 'number') {
          throw new Error('Megaplan /contractorHuman returned no meta.pagination.count')
        }
        totalCount = count
        const seen = (cursor?.seen ?? 0) + rows.length
        const last = rows[rows.length - 1]
        if (!last || seen >= count) return { items: rows, next: null }
        if (typeof last.id !== 'string' || typeof last.contentType !== 'string') {
          throw new Error('Megaplan /contractorHuman row has no id/contentType to page after')
        }
        // pageAfter takes a link entity: the last row of this page (first-party
        // SDK contractor/list.php: "Последний объект из предыдущего результата
        // для последовательной загрузки").
        return {
          items: rows,
          next: { after: { contentType: last.contentType, id: last.id }, seen },
        }
      },
    )
    reportUpstreamPage(params, { hasMore: page.hasMore, totalCount })
    // The RAML types this list as (ContractorCompany|ContractorHuman)[]; only a
    // human is a Contact.
    return page.items.filter((r) => r.contentType === CONTRACTOR_HUMAN).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<MegaplanSingleResponse<RawMegaplanContractor>>(
      `/contractor/${encodeURIComponent(id)}`,
    )
    const contractor = res.data
    if (!contractor || contractor.contentType !== CONTRACTOR_HUMAN) {
      throw Object.assign(new Error(`Megaplan: contact ${id} not found`), { statusCode: 404 })
    }
    return transformContact(contractor)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).post<MegaplanSingleResponse<RawMegaplanContractor>>(
      '/contractor',
      body,
    )
    const created = res.data
    if (!created) {
      throw new Error('Megaplan: contact creation returned no data')
    }
    return transformContact(created)
  }
}
