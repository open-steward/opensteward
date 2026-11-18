/**
 * HelpCenter.io adapter — customer-support vertical.
 *
 * HelpCenter.io is an AI-powered knowledge-base platform. Its public API v1
 * exposes two resources: articles and categories. These map to the
 * customer-support schema as:
 *
 *   articles   → Ticket  (published KB article = "resolved"; draft = "open")
 *   categories → Team    (KB categories as organisational units)
 *
 * NOTE: The HelpCenter.io API does NOT have single-resource GET endpoints.
 * GET /v1/articles/{id} and GET /v1/categories/{id} do not exist.
 * getTicket() and getTeam() therefore fetch the full list and filter by id.
 *
 * Resources NOT available via the HelpCenter.io API (return 501 automatically
 * via the interface default):
 *   - Messages, Contacts, Users, Tags, Macros, Webhooks
 *
 * Auth: static `apikey` header — NOT Authorization: Bearer.
 * Docs: https://self.helpcenter.io/content/using-the-helpcenter-io-api
 */
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Team } from '../../schema/team'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { HelpcenterIoClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformTicket, type RawHelpcenterArticle } from './transform/ticket'
import { transformTeam, type RawHelpcenterCategory } from './transform/team'

// ── API response envelopes ─────────────────────────────────────────────────

interface ArticlesResponse {
  status?: string
  articles?: RawHelpcenterArticle[]
  meta?: {
    page?: number
    per_page?: number
    total_pages?: number
    items_count?: number
  }
}

interface CategoriesResponse {
  status?: string
  categories?: RawHelpcenterCategory[]
  meta?: {
    page?: number
    per_page?: number
    total_pages?: number
    items_count?: number
  }
}

// ── Adapter ────────────────────────────────────────────────────────────────

export class HelpcenterIoAdapter implements CustomerSupportAdapter {
  readonly platform = 'helpcenter-io'
  readonly version = '0.1.0'

  // HelpCenter.io uses API-key auth only — no OAuth config needed
  constructor(_config?: Record<string, unknown>) {}

  credentialFields(): CredentialField[] {
    return adapterCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return adapterExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('helpcenter-io uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys do not expire
    return credentials
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private client(credentials: Credentials): HelpcenterIoClient {
    return new HelpcenterIoClient(credentials)
  }

  /**
   * Build HelpCenter.io pagination params.
   * Uses page-number pagination: ?page=N&limit=M
   */
  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      ...(params['page'] ? { page: Number(params['page']) } : {}),
    }
  }

  /**
   * Fetch all pages of articles. Used internally by getTicket() to find a
   * single article since the API has no single-resource GET endpoint.
   */
  private async fetchAllArticles(credentials: Credentials): Promise<RawHelpcenterArticle[]> {
    const all: RawHelpcenterArticle[] = []
    let page = 1
    while (true) {
      const res = await this.client(credentials).get<ArticlesResponse>('/articles', {
        limit: MAX_PAGE_SIZE,
        page,
      })
      const items = res.articles ?? []
      all.push(...items)
      const totalPages = res.meta?.total_pages ?? 1
      if (page >= totalPages || items.length === 0) break
      page++
    }
    return all
  }

  /**
   * Fetch all pages of categories. Used internally by getTeam() to find a
   * single category since the API has no single-resource GET endpoint.
   */
  private async fetchAllCategories(credentials: Credentials): Promise<RawHelpcenterCategory[]> {
    const all: RawHelpcenterCategory[] = []
    let page = 1
    while (true) {
      const res = await this.client(credentials).get<CategoriesResponse>('/categories', {
        limit: MAX_PAGE_SIZE,
        page,
      })
      const items = res.categories ?? []
      all.push(...items)
      const totalPages = res.meta?.total_pages ?? 1
      if (page >= totalPages || items.length === 0) break
      page++
    }
    return all
  }

  // ── Tickets (articles) ───────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const res = await this.client(credentials).get<ArticlesResponse>('/articles', this.listParams(params))
    return (res.articles ?? []).map(transformTicket)
  }

  /**
   * GET /v1/articles/{id} does not exist in the HelpCenter.io API.
   * Fetch the full article list and filter by _id / id.
   */
  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const articles = await this.fetchAllArticles(credentials)
    const article = articles.find(
      (a) => a._id === id || String(a.id ?? '') === id,
    )
    if (!article) throw new Error(`HelpCenter.io article ${id} not found`)
    return transformTicket(article)
  }

  // ── Teams (categories) ───────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const res = await this.client(credentials).get<CategoriesResponse>('/categories', this.listParams(params))
    return (res.categories ?? []).map(transformTeam)
  }

  /**
   * GET /v1/categories/{id} does not exist in the HelpCenter.io API.
   * Fetch the full category list and filter by _id / id.
   */
  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const categories = await this.fetchAllCategories(credentials)
    const category = categories.find(
      (c) => c._id === id || String(c.id ?? '') === id,
    )
    if (!category) throw new Error(`HelpCenter.io category ${id} not found`)
    return transformTeam(category)
  }
}
