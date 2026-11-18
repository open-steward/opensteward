/**
 * Tiny ERP API v3 — Accounting Adapter.
 *
 * Supported resources:
 *   - Organization (GET /info)
 *   - Invoices / Bills (GET /notas, GET /notas/:id) — tipo='S' → invoice, tipo='E' → bill
 *   - Contacts (GET /contatos, GET /contatos/:id, POST /contatos, PUT /contatos/:id)
 *   - Accounts (GET /contas, GET /contas/:id) — plano de contas (chart of accounts)
 *   - TaxRates (GET /aliquotas, GET /aliquotas/:id) — alíquotas de impostos
 *   - Orders / SalesOrders (GET /pedidos, GET /pedidos/:id) — pedidos de venda
 *   - PurchaseOrders (GET /ordem-compra, GET /ordem-compra/:id) — ordens de compra
 *   - Transactions (GET /contas-pagar, GET /contas-receber) — payables & receivables
 *
 * Auth: OAuth2 authorization_code via Keycloak at accounts.tiny.com.br.
 * Base URL: https://api.tiny.com.br/public-api/v3
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: creditmemo — Tiny v3 has no dedicated credit memo or credit note endpoint; returns/devoluções are handled via Nota Fiscal cancellation
 * Unavailable: expense — Tiny v3 has no expense report endpoint; categorias-receita-despesa is a category list only
 * Unavailable: journal — Tiny v3 has no journal entry (lançamentos contábeis) endpoint
 */

import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Organization } from '../../schema/organization'
import type { Account } from '../../schema/account'
import type { TaxRate } from '../../schema/taxrate'
import type { Order } from '../../schema/order'
import type { SalesOrder } from '../../schema/salesorder'
import type { PurchaseOrder } from '../../schema/purchaseorder'
import type { Transaction } from '../../schema/transaction'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { TinyClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformInvoice, type TinyNotaFiscal } from './transform/invoice'
import { transformBill } from './transform/bill'
import { transformContact, type TinyContato } from './transform/contact'
import { transformOrganization, type TinyInfoConta } from './transform/organization'
import { transformAccount, type TinyConta } from './transform/account'
import { transformTaxRate, type TinyAliquota } from './transform/taxrate'
import { transformOrder, type TinyPedido } from './transform/order'
import { transformSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type TinyOrdemCompra } from './transform/purchaseorder'
import { transformTransaction, type TinyConta as TinyContaFinanceira } from './transform/transaction'

// ── Config ────────────────────────────────────────────────────────────────────

interface TinyAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

// ── Pagination helpers ────────────────────────────────────────────────────────

/** Convert QueryParams to Tiny v3 pagination query params (limit/offset). */
function paginationParams(
  params: QueryParams,
): { limit: number; offset: number } {
  const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100)
  const page = params.page ?? 1
  const offset = (page - 1) * limit
  return { limit, offset }
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class TinyAdapter implements AccountingAdapter {
  readonly platform = 'tiny'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: TinyAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return exchangeCode(code, this.clientId, this.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    return refreshAccessToken(credentials.refreshToken, this.clientId, this.clientSecret)
  }

  // ── Organization ──────────────────────────────────────────────────────────

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new TinyClient(credentials)
    const raw = await client.get<TinyInfoConta>('info')
    return transformOrganization(raw)
  }

  // ── Invoices (tipo='S' = Saída) ───────────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new TinyClient(credentials)
    const { limit, offset } = paginationParams(params)
    const query: Record<string, string | number | undefined> = {
      limit,
      offset,
      tipo: 'S',
    }
    if (params.updatedAfter) {
      // Tiny v3 filtering: dataInicial accepts YYYY-MM-DD
      query['dataInicial'] = params.updatedAfter.toISOString().split('T')[0]
    }
    const res = await client.list<TinyNotaFiscal>('notas', query)
    return (res.itens ?? [])
      .filter((n) => n.tipo !== 'E')
      .map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new TinyClient(credentials)
    const raw = await client.get<TinyNotaFiscal>(`notas/${id}`)
    return transformInvoice(raw)
  }

  // ── Bills (tipo='E' = Entrada) ────────────────────────────────────────────

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new TinyClient(credentials)
    const { limit, offset } = paginationParams(params)
    const query: Record<string, string | number | undefined> = {
      limit,
      offset,
      tipo: 'E',
    }
    if (params.updatedAfter) {
      query['dataInicial'] = params.updatedAfter.toISOString().split('T')[0]
    }
    const res = await client.list<TinyNotaFiscal>('notas', query)
    return (res.itens ?? [])
      .filter((n) => n.tipo === 'E')
      .map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new TinyClient(credentials)
    const raw = await client.get<TinyNotaFiscal>(`notas/${id}`)
    return transformBill(raw)
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new TinyClient(credentials)
    const { limit, offset } = paginationParams(params)
    const query: Record<string, string | number | undefined> = { limit, offset }
    if (params.updatedAfter) {
      query['dataAtualizacao'] = params.updatedAfter.toISOString().split('T')[0]
    }
    const res = await client.list<TinyContato>('contatos', query)
    return (res.itens ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new TinyClient(credentials)
    const raw = await client.get<TinyContato>(`contatos/${id}`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new TinyClient(credentials)
    const body: Record<string, unknown> = {
      nome: data.name ?? data.companyName,
      fantasia: data.companyName,
      email: data.emails?.[0]?.email,
      telefone: data.telephones?.find((t) => t.type === 'WORK')?.telephone,
      celular: data.telephones?.find((t) => t.type === 'MOBILE')?.telephone,
      situacao: 'B',
    }
    if (data.billingAddress) {
      body['endereco'] = {
        endereco: data.billingAddress.address1,
        complemento: data.billingAddress.address2,
        municipio: data.billingAddress.city,
        cep: data.billingAddress.postalCode,
        uf: data.billingAddress.region,
      }
    }
    const raw = await client.post<TinyContato>('contatos', body)
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new TinyClient(credentials)
    const body: Record<string, unknown> = {}
    if (data.name) body['nome'] = data.name
    if (data.companyName) body['fantasia'] = data.companyName
    if (data.emails?.[0]?.email) body['email'] = data.emails[0].email
    if (data.telephones?.find((t) => t.type === 'WORK')) {
      body['telefone'] = data.telephones.find((t) => t.type === 'WORK')?.telephone
    }
    if (data.telephones?.find((t) => t.type === 'MOBILE')) {
      body['celular'] = data.telephones.find((t) => t.type === 'MOBILE')?.telephone
    }
    if (data.billingAddress) {
      body['endereco'] = {
        endereco: data.billingAddress.address1,
        complemento: data.billingAddress.address2,
        municipio: data.billingAddress.city,
        cep: data.billingAddress.postalCode,
        uf: data.billingAddress.region,
      }
    }
    const raw = await client.put<TinyContato>(`contatos/${id}`, body)
    return transformContact(raw)
  }

  // ── Accounts (Contas / Chart of Accounts) ─────────────────────────────────

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new TinyClient(credentials)
    const { limit, offset } = paginationParams(params)
    const res = await client.list<TinyConta>('contas', { limit, offset })
    return (res.itens ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new TinyClient(credentials)
    const raw = await client.get<TinyConta>(`contas/${id}`)
    return transformAccount(raw)
  }

  // ── Tax Rates (Alíquotas) ─────────────────────────────────────────────────

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new TinyClient(credentials)
    const { limit, offset } = paginationParams(params)
    const res = await client.list<TinyAliquota>('aliquotas', { limit, offset })
    return (res.itens ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new TinyClient(credentials)
    const raw = await client.get<TinyAliquota>(`aliquotas/${id}`)
    return transformTaxRate(raw)
  }

  // ── Orders / Sales Orders (Pedidos) ──────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new TinyClient(credentials)
    const { limit, offset } = paginationParams(params)
    const query: Record<string, string | number | undefined> = { limit, offset }
    if (params.updatedAfter) {
      query['dataInicial'] = params.updatedAfter.toISOString().split('T')[0]
    }
    const res = await client.list<TinyPedido>('pedidos', query)
    return (res.itens ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new TinyClient(credentials)
    const raw = await client.get<TinyPedido>(`pedidos/${id}`)
    return transformOrder(raw)
  }

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new TinyClient(credentials)
    const { limit, offset } = paginationParams(params)
    const query: Record<string, string | number | undefined> = { limit, offset }
    if (params.updatedAfter) {
      query['dataInicial'] = params.updatedAfter.toISOString().split('T')[0]
    }
    const res = await client.list<TinyPedido>('pedidos', query)
    return (res.itens ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new TinyClient(credentials)
    const raw = await client.get<TinyPedido>(`pedidos/${id}`)
    return transformSalesOrder(raw)
  }

  // ── Purchase Orders (Ordens de Compra) ───────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new TinyClient(credentials)
    const { limit, offset } = paginationParams(params)
    const query: Record<string, string | number | undefined> = { limit, offset }
    if (params.updatedAfter) {
      query['dataInicial'] = params.updatedAfter.toISOString().split('T')[0]
    }
    const res = await client.list<TinyOrdemCompra>('ordem-compra', query)
    return (res.itens ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new TinyClient(credentials)
    const raw = await client.get<TinyOrdemCompra>(`ordem-compra/${id}`)
    return transformPurchaseOrder(raw)
  }

  // ── Transactions (Contas a Pagar + Contas a Receber) ─────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new TinyClient(credentials)
    const { limit, offset } = paginationParams(params)
    const query: Record<string, string | number | undefined> = { limit, offset }
    if (params.updatedAfter) {
      query['dataInicial'] = params.updatedAfter.toISOString().split('T')[0]
    }
    const [payables, receivables] = await Promise.all([
      client.list<TinyContaFinanceira>('contas-pagar', query),
      client.list<TinyContaFinanceira>('contas-receber', query),
    ])
    return [
      ...(payables.itens ?? []).map((r) => transformTransaction(r, 'PAYABLE')),
      ...(receivables.itens ?? []).map((r) => transformTransaction(r, 'RECEIVABLE')),
    ]
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    // id is prefixed with 'r_' for receivables; all others treated as payables
    const client = new TinyClient(credentials)
    if (id.startsWith('r_')) {
      const raw = await client.get<TinyContaFinanceira>(`contas-receber/${id.slice(2)}`)
      return transformTransaction(raw, 'RECEIVABLE')
    }
    const rawId = id.startsWith('p_') ? id.slice(2) : id
    const raw = await client.get<TinyContaFinanceira>(`contas-pagar/${rawId}`)
    return transformTransaction(raw, 'PAYABLE')
  }
}
