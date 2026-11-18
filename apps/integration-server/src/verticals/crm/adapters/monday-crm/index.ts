/**
 * Monday CRM adapter — maps Monday.com's board-based data model to canonical
 * CRM resources via the GraphQL API.
 *
 * Monday.com is a GraphQL-only API. All operations go through a single
 * POST endpoint (`https://api.monday.com/v2`). CRM concepts are mapped to
 * boards; the caller configures which board IDs correspond to Contacts,
 * Companies, and Deals via `credentials.extra`:
 *   - `contactBoardId`  — Monday board for Contacts
 *   - `companyBoardId`  — Monday board for Companies
 *   - `dealBoardId`     — Monday board for Deals
 *
 * Resource coverage:
 *   - Contacts  (full CRUD)
 *   - Companies  (full CRUD)
 *   - Deals  (full CRUD)
 *   - Pipelines  (list + get — boards with status column as stages)
 *   - Activities  (list, create, update, delete — board configured via `activityBoardId`)
 *   - Notes / Updates  (list, create, delete — no update endpoint in Monday API)
 *
 * Docs: https://developer.monday.com/api-reference/
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Note } from '../../schema/note'
import type { Activity } from '../../schema/activity'
import { connectionScope, cursorPagerKey, pageByCursor, reportUpstreamPage } from '@opensteward/shared'

import { MondayClient, type MondayItem, type MondayUpdate, type MondayBoard } from './client'
import { DEFAULT_LIMIT, MAX_PAGE_SIZE } from './constants'
import { buildAuthUrl, exchangeCode as doExchangeCode, refreshToken as doRefreshToken } from './auth'
import { verifyMondayWebhook, parseMondayWebhookEvents } from './webhook'

import { transformContact, untransformContact } from './transform/contact'
import { transformCompany, untransformCompany } from './transform/company'
import { transformDeal, untransformDeal } from './transform/deal'
import { transformPipeline } from './transform/pipeline'
import { transformNote } from './transform/note'
import { transformActivity, untransformActivity } from './transform/activity'

export interface MondayCrmAdapterConfig {
  /** OAuth2 client id. */
  clientId?: string
  /** OAuth2 client secret. */
  clientSecret?: string
  /** OAuth2 redirect URI. */
  redirectUri?: string
}

// ── GraphQL query/mutation strings ─────────────────────────────────────────

const COLUMN_VALUES_FRAGMENT = `id name column_values { id text type value }`

const ITEMS_PAGE_QUERY = `
  query ($boardId: ID!, $limit: Int!, $cursor: String) {
    boards(ids: [$boardId]) {
      items_page(limit: $limit, cursor: $cursor) {
        cursor
        items { ${COLUMN_VALUES_FRAGMENT} }
      }
    }
  }
`

const GET_ITEM_QUERY = `
  query ($itemId: ID!) {
    items(ids: [$itemId]) { ${COLUMN_VALUES_FRAGMENT} }
  }
`

const CREATE_ITEM_MUTATION = `
  mutation ($boardId: ID!, $itemName: String!, $columnValues: JSON!) {
    create_item(board_id: $boardId, item_name: $itemName, column_values: $columnValues) {
      ${COLUMN_VALUES_FRAGMENT}
    }
  }
`

const UPDATE_ITEM_MUTATION = `
  mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
    change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) {
      ${COLUMN_VALUES_FRAGMENT}
    }
  }
`

const DELETE_ITEM_MUTATION = `
  mutation ($itemId: ID!) {
    delete_item(item_id: $itemId) { id }
  }
`

const BOARD_COLUMNS_QUERY = `
  query ($boardId: ID!) {
    boards(ids: [$boardId]) { id name columns { id title type settings_str } }
  }
`

const GET_ITEM_UPDATES_QUERY = `
  query ($itemId: ID!) {
    items(ids: [$itemId]) {
      updates { id body creator_id created_at }
    }
  }
`

const CREATE_UPDATE_MUTATION = `
  mutation ($itemId: ID!, $body: String!) {
    create_update(item_id: $itemId, body: $body) { id body creator_id created_at }
  }
`

const DELETE_UPDATE_MUTATION = `
  mutation ($updateId: ID!) {
    delete_update(id: $updateId) { id }
  }
`

// ── Response shape helpers ─────────────────────────────────────────────────

interface ItemsPageData {
  boards: Array<{
    items_page: {
      cursor: string | null
      items: MondayItem[]
    }
  }>
}

interface ItemData {
  items: MondayItem[]
}

interface CreateItemData {
  create_item: MondayItem
}

interface UpdateItemData {
  change_multiple_column_values: MondayItem
}

interface BoardColumnsData {
  boards: MondayBoard[]
}

interface ItemUpdatesData {
  items: Array<{ updates: MondayUpdate[] }>
}

interface CreateUpdateData {
  create_update: MondayUpdate
}

export class MondayCrmAdapter implements CrmAdapter {
  readonly platform = 'monday-crm'
  readonly version = '0.1.0'

  private clientId: string | undefined
  private clientSecret: string | undefined
  private redirectUri: string | undefined

  constructor(config: MondayCrmAdapterConfig = {}) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, _overrideScopes?: string[]): string {
    return buildAuthUrl({
      clientId: this.clientId ?? '',
      clientSecret: this.clientSecret ?? '',
      redirectUri: this.redirectUri ?? '',
    }, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('MondayCRM exchangeCode: clientId and clientSecret required')
    }
    return doExchangeCode({
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      redirectUri,
    }, code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!this.clientId || !this.clientSecret) return credentials
    return doRefreshToken({
      clientId: this.clientId,
      clientSecret: this.clientSecret,
    }, credentials)
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyMondayWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseMondayWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): MondayClient {
    return new MondayClient(credentials)
  }

  private boardId(credentials: Credentials, key: 'contactBoardId' | 'companyBoardId' | 'dealBoardId' | 'activityBoardId'): string {
    const id = credentials.extra?.[key] as string | undefined
    if (!id) {
      throw new Error(`MondayCRM: credentials.extra.${key} is required`)
    }
    return id
  }

  /**
   * One caller page of a board's items. `items_page(limit, cursor)` pages by
   * an opaque cursor (limit default 25, maximum 500) and returns the cursor
   * that starts the next page, null at the end, so upstream page k IS caller
   * page k at the size sent.
   * https://developer.monday.com/api-reference/reference/items-page
   */
  private async listItemsFromBoard(
    credentials: Credentials,
    boardId: string,
    params: QueryParams,
  ): Promise<MondayItem[]> {
    const asked = typeof params.limit === 'number' && params.limit >= 1 ? Math.floor(params.limit) : DEFAULT_LIMIT
    const limit = Math.min(asked, MAX_PAGE_SIZE)
    const client = this.client(credentials)
    const key = cursorPagerKey(connectionScope('monday-crm', credentials), 'items_page', { boardId, limit })
    const { items, hasMore } = await pageByCursor<MondayItem>(key, params.page, async (cursor) => {
      const data = await client.query<ItemsPageData>(ITEMS_PAGE_QUERY, { boardId, limit, cursor })
      const page = data.boards[0]?.items_page
      return { items: page?.items ?? [], next: page?.cursor ?? null }
    })
    reportUpstreamPage(params, { hasMore, pageSize: limit })
    return items
  }

  private async getItem(credentials: Credentials, itemId: string): Promise<MondayItem> {
    const data = await this.client(credentials).query<ItemData>(
      GET_ITEM_QUERY,
      { itemId },
    )
    const item = data.items[0]
    if (!item) {
      throw Object.assign(new Error(`MondayCRM: item ${itemId} not found`), { statusCode: 404 })
    }
    return item
  }

  private async createItem(
    credentials: Credentials,
    boardId: string,
    body: { name: string; column_values: string },
  ): Promise<MondayItem> {
    const data = await this.client(credentials).query<CreateItemData>(
      CREATE_ITEM_MUTATION,
      { boardId, itemName: body.name, columnValues: body.column_values },
    )
    return data.create_item
  }

  private async updateItem(
    credentials: Credentials,
    boardId: string,
    itemId: string,
    body: { name?: string; column_values: string },
  ): Promise<MondayItem> {
    const data = await this.client(credentials).query<UpdateItemData>(
      UPDATE_ITEM_MUTATION,
      { boardId, itemId, columnValues: body.column_values },
    )
    return data.change_multiple_column_values
  }

  private async deleteItem(credentials: Credentials, itemId: string): Promise<void> {
    await this.client(credentials).query(DELETE_ITEM_MUTATION, { itemId })
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const boardId = this.boardId(credentials, 'contactBoardId')
    const items = await this.listItemsFromBoard(credentials, boardId, params)
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.getItem(credentials, id)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const boardId = this.boardId(credentials, 'contactBoardId')
    const body = untransformContact(data) as { name: string; column_values: string }
    const raw = await this.createItem(credentials, boardId, body)
    return transformContact(raw)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const boardId = this.boardId(credentials, 'contactBoardId')
    const body = untransformContact(data) as { name?: string; column_values: string }
    const raw = await this.updateItem(credentials, boardId, id, body)
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.deleteItem(credentials, id)
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const boardId = this.boardId(credentials, 'companyBoardId')
    const items = await this.listItemsFromBoard(credentials, boardId, params)
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.getItem(credentials, id)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const boardId = this.boardId(credentials, 'companyBoardId')
    const body = untransformCompany(data) as { name: string; column_values: string }
    const raw = await this.createItem(credentials, boardId, body)
    return transformCompany(raw)
  }

  async updateCompany(credentials: Credentials, id: string, data: Partial<Company>): Promise<Company> {
    const boardId = this.boardId(credentials, 'companyBoardId')
    const body = untransformCompany(data) as { name?: string; column_values: string }
    const raw = await this.updateItem(credentials, boardId, id, body)
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.deleteItem(credentials, id)
  }

  // ── Deals ─────────────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const boardId = this.boardId(credentials, 'dealBoardId')
    const items = await this.listItemsFromBoard(credentials, boardId, params)
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.getItem(credentials, id)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const boardId = this.boardId(credentials, 'dealBoardId')
    const body = untransformDeal(data) as { name: string; column_values: string }
    const raw = await this.createItem(credentials, boardId, body)
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const boardId = this.boardId(credentials, 'dealBoardId')
    const body = untransformDeal(data) as { name?: string; column_values: string }
    const raw = await this.updateItem(credentials, boardId, id, body)
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.deleteItem(credentials, id)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  async listPipelines(credentials: Credentials, _params: QueryParams): Promise<Pipeline[]> {
    const boardIds = [
      credentials.extra?.['contactBoardId'],
      credentials.extra?.['companyBoardId'],
      credentials.extra?.['dealBoardId'],
    ].filter((id): id is string => typeof id === 'string')

    const pipelines: Pipeline[] = []
    for (const boardId of boardIds) {
      const data = await this.client(credentials).query<BoardColumnsData>(
        BOARD_COLUMNS_QUERY,
        { boardId },
      )
      const board = data.boards[0]
      if (board) pipelines.push(transformPipeline(board))
    }
    return pipelines
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const data = await this.client(credentials).query<BoardColumnsData>(
      BOARD_COLUMNS_QUERY,
      { boardId: id },
    )
    const board = data.boards[0]
    if (!board) {
      throw Object.assign(
        new Error(`MondayCRM: board/pipeline '${id}' not found`),
        { statusCode: 404 },
      )
    }
    return transformPipeline(board)
  }

  // ── Notes (Monday Updates) ────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const contactId = params['contact_id'] as string | undefined
    if (!contactId) {
      throw new Error('MondayCRM listNotes: contact_id param is required')
    }

    const data = await this.client(credentials).query<ItemUpdatesData>(
      GET_ITEM_UPDATES_QUERY,
      { itemId: contactId },
    )
    const updates = data.items[0]?.updates ?? []
    return updates.map((u) => transformNote(u, contactId))
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    // Monday has no direct "get update by id" endpoint; we can only get notes
    // in context of an item. Return a minimal note using just the id.
    throw Object.assign(
      new Error(`MondayCRM: getNote(${id}) — use listNotes with contact_id to retrieve notes`),
      { statusCode: 501 },
    )
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const itemId = data.contact_id
    if (!itemId) throw new Error('MondayCRM createNote: contact_id is required')

    const result = await this.client(credentials).query<CreateUpdateData>(
      CREATE_UPDATE_MUTATION,
      { itemId, body: data.content ?? '' },
    )
    return transformNote(result.create_update, itemId)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).query(DELETE_UPDATE_MUTATION, { updateId: id })
  }

  // ── Activities (board-based) ──────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const boardId = this.boardId(credentials, 'activityBoardId')
    const items = await this.listItemsFromBoard(credentials, boardId, params)
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.getItem(credentials, id)
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const boardId = this.boardId(credentials, 'activityBoardId')
    const body = untransformActivity(data) as { name: string; column_values: string }
    const raw = await this.createItem(credentials, boardId, body)
    return transformActivity(raw)
  }

  async updateActivity(credentials: Credentials, id: string, data: Partial<Activity>): Promise<Activity> {
    const boardId = this.boardId(credentials, 'activityBoardId')
    const body = untransformActivity(data) as { name?: string; column_values: string }
    const raw = await this.updateItem(credentials, boardId, id, body)
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.deleteItem(credentials, id)
  }
}
