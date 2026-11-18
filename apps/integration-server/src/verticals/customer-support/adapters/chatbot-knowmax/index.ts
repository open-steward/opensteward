/**
 * Knowmax adapter — customer-support vertical.
 *
 * Knowmax is a knowledge management platform (not a helpdesk).  Its public
 * REST API exposes two primary resources:
 *   • Articles / FAQs  → mapped to Ticket
 *   • Categories        → mapped to Team
 *
 * Resources without a Knowmax equivalent (contacts, users, tags, messages,
 * macros) are left unimplemented and auto-501 via the base interface.
 *
 * Auth: per-tenant Bearer token.
 *   Base URL: https://app.knowmax.ai/{clientName}
 *   Header:   Authorization: Bearer <apiToken>
 *
 * Postman collection: https://documenter.getpostman.com/view/10036214/SWLk3kVm
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
import { KnowmaxClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformArticle, type RawKnowmaxArticle } from './transform/ticket'
import { transformCategory, type RawKnowmaxCategory } from './transform/team'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ChatbotKnowmaxAdapterConfig {}

/** Knowmax list-articles response envelope. */
interface ArticlesResponse {
  data?: RawKnowmaxArticle[]
  articles?: RawKnowmaxArticle[]
}

/** Knowmax single-article response envelope. */
interface ArticleResponse {
  data?: RawKnowmaxArticle
  article?: RawKnowmaxArticle
}

/** Knowmax list-categories response envelope. */
interface CategoriesResponse {
  data?: RawKnowmaxCategory[]
  categories?: RawKnowmaxCategory[]
}

/** Knowmax single-category response envelope. */
interface CategoryResponse {
  data?: RawKnowmaxCategory
  category?: RawKnowmaxCategory
}

export class ChatbotKnowmaxAdapter implements CustomerSupportAdapter {
  readonly platform = 'chatbot-knowmax'
  readonly version = '0.1.0'

   
  constructor(_config: ChatbotKnowmaxAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return adapterCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return adapterExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('chatbot-knowmax uses static Bearer token auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Knowmax tokens do not expire on a rolling basis
    return credentials
  }

  private client(credentials: Credentials): KnowmaxClient {
    return new KnowmaxClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      per_page: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params['page'] ? { page: Number(params['page']) } : {}),
    }
  }

  // ── Articles → Tickets ────────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const res = await this.client(credentials).get<ArticlesResponse>(
      '/api/v1/articles',
      this.listParams(params),
    )
    const articles = res.data ?? res.articles ?? []
    return articles.map(transformArticle)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).get<ArticleResponse>(`/api/v1/articles/${id}`)
    const article = res.data ?? res.article
    if (!article) throw new Error(`chatbot-knowmax: article ${id} not found`)
    return transformArticle(article)
  }

  // ── Categories → Teams ────────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const res = await this.client(credentials).get<CategoriesResponse>(
      '/api/v1/categories',
      this.listParams(params),
    )
    const categories = res.data ?? res.categories ?? []
    return categories.map(transformCategory)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const res = await this.client(credentials).get<CategoryResponse>(`/api/v1/categories/${id}`)
    const category = res.data ?? res.category
    if (!category) throw new Error(`chatbot-knowmax: category ${id} not found`)
    return transformCategory(category)
  }
}
