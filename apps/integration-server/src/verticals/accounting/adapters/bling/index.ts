import { toCalendarDate } from '../shared/transform'
// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: creditmemo — Bling v3 has no credit note / credit memo endpoint; the platform does not model this concept separately from invoices
// Unavailable: expense    — Bling v3 has no standalone expense endpoint; categoriasReceitasDespesas is an income/expense category list, not expense records
// Unavailable: journal    — Bling v3 has no lancamentos (journal entry) endpoint in the public API
// Unavailable: order      — Bling has only sales orders (pedidosVendas) and purchase orders (pedidosCompras), both already wired; no unified order resource exists

import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Organization } from '../../schema/organization'
import type { SalesOrder } from '../../schema/salesorder'
import type { PurchaseOrder } from '../../schema/purchaseorder'
import type { TaxRate } from '../../schema/taxrate'
import type { Transaction } from '../../schema/transaction'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { BlingClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type BlingNfe } from './transform/invoice'
import { transformContact, type BlingContato } from './transform/contact'
import { transformAccount, type BlingContaContabil } from './transform/account'
import { transformOrganization, type BlingEmpresa } from './transform/organization'
import { transformBill, type BlingContaPagar } from './transform/bill'
import { transformSalesOrder, type BlingPedidoVenda } from './transform/salesorder'
import { transformPurchaseOrder, type BlingPedidoCompra } from './transform/purchaseorder'
import { transformTaxRate, type BlingImposto } from './transform/taxrate'
import { transformTransaction, type BlingContaReceber } from './transform/transaction'

interface BlingAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

/** Bling API v3 list envelope: { data: T[] } */
interface BlingListResponse<T> {
  data: T[]
}

/** Bling API v3 single-item envelope: { data: T } */
interface BlingSingleResponse<T> {
  data: T
}

function clampPage(params: QueryParams): { pagina: number; limite: number } {
  return {
    pagina: params.page ?? 1,
    limite: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
  }
}

export class BlingAdapter implements AccountingAdapter {
  readonly platform = 'bling'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: BlingAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes
  }

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

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new BlingClient(credentials)
    const res = await client.get<BlingSingleResponse<BlingEmpresa>>('empresas/me/dados-basicos')
    return transformOrganization(res.data)
  }

  // --- Invoices (NF-e) ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new BlingClient(credentials)
    const { pagina, limite } = clampPage(params)
    const query: Record<string, unknown> = { pagina, limite }
    if (params.updatedAfter) {
      // Bling filters by emission date range
      query.dataEmissaoInicial = params.updatedAfter.toISOString().split('T')[0]
    }
    const res = await client.get<BlingListResponse<BlingNfe>>('nfe', query)
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new BlingClient(credentials)
    const res = await client.get<BlingSingleResponse<BlingNfe>>(`nfe/${id}`)
    return transformInvoice(res.data)
  }

  // --- Bills (contas a pagar) ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new BlingClient(credentials)
    const { pagina, limite } = clampPage(params)
    const query: Record<string, unknown> = { pagina, limite }
    if (params.updatedAfter) {
      query.dataEmissaoInicial = params.updatedAfter.toISOString().split('T')[0]
    }
    const res = await client.get<BlingListResponse<BlingContaPagar>>('contas/pagar', query)
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new BlingClient(credentials)
    const res = await client.get<BlingSingleResponse<BlingContaPagar>>(`contas/pagar/${id}`)
    return transformBill(res.data)
  }

  async createBill(credentials: Credentials, data: Partial<Bill>): Promise<Bill> {
    const client = new BlingClient(credentials)
    const body: Record<string, unknown> = {}
    if (data.totalAmount != null) body['valor'] = data.totalAmount / 100
    if (data.dueAt) body['vencimento'] = toCalendarDate(data.dueAt)
    if (data.postedAt) body['dataEmissao'] = toCalendarDate(data.postedAt)
    if (data.contactId) body['contato'] = { id: Number(data.contactId) }
    if (data.billNumber) body['numeroDocumento'] = data.billNumber
    if (data.notes) body['historico'] = data.notes
    const res = await client.post<BlingSingleResponse<BlingContaPagar>>('contas/pagar', body)
    return transformBill(res.data)
  }

  async updateBill(credentials: Credentials, id: string, data: Partial<Bill>): Promise<Bill> {
    const client = new BlingClient(credentials)
    const body: Record<string, unknown> = {}
    if (data.totalAmount != null) body['valor'] = data.totalAmount / 100
    if (data.dueAt) body['vencimento'] = toCalendarDate(data.dueAt)
    if (data.postedAt) body['dataEmissao'] = toCalendarDate(data.postedAt)
    if (data.contactId) body['contato'] = { id: Number(data.contactId) }
    if (data.billNumber) body['numeroDocumento'] = data.billNumber
    if (data.notes) body['historico'] = data.notes
    const res = await client.put<BlingSingleResponse<BlingContaPagar>>(`contas/pagar/${id}`, body)
    return transformBill(res.data)
  }

  // --- Contacts (contatos) ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new BlingClient(credentials)
    const { pagina, limite } = clampPage(params)
    const query: Record<string, unknown> = { pagina, limite }
    if (params.updatedAfter) {
      query.dataAlteracaoInicial = params.updatedAfter.toISOString().split('T')[0]
    }
    const res = await client.get<BlingListResponse<BlingContato>>('contatos', query)
    return (res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new BlingClient(credentials)
    const res = await client.get<BlingSingleResponse<BlingContato>>(`contatos/${id}`)
    return transformContact(res.data)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new BlingClient(credentials)
    const body: Record<string, unknown> = {
      nome: data.name ?? data.companyName,
      situacao: 'A',
    }
    if (data.emails?.[0]?.email) body['email'] = data.emails[0].email
    if (data.telephones?.[0]?.telephone) body['telefone'] = data.telephones[0].telephone
    if (data.taxNumber) body['numeroDocumento'] = data.taxNumber
    if (data.companyName) {
      body['tipo'] = 'J'
      body['fantasia'] = data.companyName
    }
    const res = await client.post<BlingSingleResponse<BlingContato>>('contatos', body)
    return transformContact(res.data)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const client = new BlingClient(credentials)
    const body: Record<string, unknown> = {}
    if (data.name) body['nome'] = data.name
    if (data.emails?.[0]?.email) body['email'] = data.emails[0].email
    if (data.telephones?.[0]?.telephone) body['telefone'] = data.telephones[0].telephone
    if (data.taxNumber) body['numeroDocumento'] = data.taxNumber
    if (data.isActive != null) body['situacao'] = data.isActive ? 'A' : 'I'
    const res = await client.put<BlingSingleResponse<BlingContato>>(`contatos/${id}`, body)
    return transformContact(res.data)
  }

  // --- Accounts (contas contabeis) ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new BlingClient(credentials)
    const { pagina, limite } = clampPage(params)
    const res = await client.get<BlingListResponse<BlingContaContabil>>('contas-contabeis', {
      pagina,
      limite,
    })
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new BlingClient(credentials)
    const res = await client.get<BlingSingleResponse<BlingContaContabil>>(`contas-contabeis/${id}`)
    return transformAccount(res.data)
  }

  // --- Sales Orders (pedidos de venda) ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new BlingClient(credentials)
    const { pagina, limite } = clampPage(params)
    const query: Record<string, unknown> = { pagina, limite }
    if (params.updatedAfter) {
      query.dataAlteracaoInicial = params.updatedAfter.toISOString().split('T')[0]
    }
    const res = await client.get<BlingListResponse<BlingPedidoVenda>>('pedidos/vendas', query)
    return (res.data ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new BlingClient(credentials)
    const res = await client.get<BlingSingleResponse<BlingPedidoVenda>>(`pedidos/vendas/${id}`)
    return transformSalesOrder(res.data)
  }

  // --- Purchase Orders (pedidos de compra) ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new BlingClient(credentials)
    const { pagina, limite } = clampPage(params)
    const query: Record<string, unknown> = { pagina, limite }
    if (params.updatedAfter) {
      query.dataAlteracaoInicial = params.updatedAfter.toISOString().split('T')[0]
    }
    const res = await client.get<BlingListResponse<BlingPedidoCompra>>('pedidos/compras', query)
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new BlingClient(credentials)
    const res = await client.get<BlingSingleResponse<BlingPedidoCompra>>(`pedidos/compras/${id}`)
    return transformPurchaseOrder(res.data)
  }

  // --- Tax Rates (impostos) ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new BlingClient(credentials)
    const { pagina, limite } = clampPage(params)
    const res = await client.get<BlingListResponse<BlingImposto>>('impostos', { pagina, limite })
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new BlingClient(credentials)
    const res = await client.get<BlingSingleResponse<BlingImposto>>(`impostos/${id}`)
    return transformTaxRate(res.data)
  }

  // --- Transactions (contas a receber / accounts receivable) ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new BlingClient(credentials)
    const { pagina, limite } = clampPage(params)
    const query: Record<string, unknown> = { pagina, limite }
    if (params.updatedAfter) {
      query.dataEmissaoInicial = params.updatedAfter.toISOString().split('T')[0]
    }
    const res = await client.get<BlingListResponse<BlingContaReceber>>('contas/receber', query)
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new BlingClient(credentials)
    const res = await client.get<BlingSingleResponse<BlingContaReceber>>(`contas/receber/${id}`)
    return transformTransaction(res.data)
  }
}
