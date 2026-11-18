import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { Transaction } from '../../schema/transaction'
import type { TaxRate } from '../../schema/taxrate'
import type { Expense } from '../../schema/expense'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Order } from '../../schema/order'
import type { SalesOrder } from '../../schema/salesorder'
import type { PurchaseOrder } from '../../schema/purchaseorder'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { NuvemFiscalClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type NuvemFiscalNotaFiscal } from './transform/invoice'
import { transformBill, type NuvemFiscalBill } from './transform/bill'
import { transformCustomer, transformSupplier, type NuvemFiscalCliente, type NuvemFiscalFornecedor } from './transform/contact'
import { transformAccount, type NuvemFiscalAccount } from './transform/account'
import { transformJournal, untransformJournal, type NuvemFiscalLancamento } from './transform/journal'
import { transformOrganization, type NuvemFiscalEmpresa } from './transform/organization'
import { transformTransaction, type NuvemFiscalMovimentacao } from './transform/transaction'
import { transformTaxRate, type NuvemFiscalAliquota } from './transform/taxrate'
import { transformExpense, untransformExpense, type NuvemFiscalDespesa } from './transform/expense'
import { transformCreditMemo, untransformCreditMemo, type NuvemFiscalNotaCredito } from './transform/creditmemo'
import { transformOrder, untransformOrder, type NuvemFiscalPedido } from './transform/order'
import { transformSalesOrder, untransformSalesOrder, type NuvemFiscalOrdemVenda } from './transform/salesorder'
import { transformPurchaseOrder, untransformPurchaseOrder, type NuvemFiscalOrdemCompra } from './transform/purchaseorder'

interface NuvemFiscalAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

export class NuvemFiscalAdapter implements AccountingAdapter {
  readonly platform = 'nuvemfiscal'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: NuvemFiscalAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, (overrideScopes ?? this.scopes), state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return exchangeCode(code, this.clientId, this.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    return refreshAccessToken(credentials.refreshToken, this.clientId, this.clientSecret)
  }

  /** OData-style pagination: $skip + $top */
  private paginationParams(params: QueryParams): Record<string, unknown> {
    const top = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = params.page ?? 1
    return {
      $top: top,
      $skip: (page - 1) * top,
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new NuvemFiscalClient(credentials)
    const res = await client.get<NuvemFiscalEmpresa>('/empresas/me')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new NuvemFiscalClient(credentials)
    const res = await client.get<{ data: NuvemFiscalNotaFiscal[] }>('/notas-fiscais', this.paginationParams(params))
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new NuvemFiscalClient(credentials)
    const res = await client.get<NuvemFiscalNotaFiscal>(`/notas-fiscais/${id}`)
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new NuvemFiscalClient(credentials)
    const res = await client.post<NuvemFiscalNotaFiscal>('/notas-fiscais', untransformInvoice(data))
    return transformInvoice(res)
  }

  async updateInvoice(credentials: Credentials, id: string, data: Partial<Invoice>): Promise<Invoice> {
    const client = new NuvemFiscalClient(credentials)
    const res = await client.put<NuvemFiscalNotaFiscal>(`/notas-fiscais/${id}`, untransformInvoice(data))
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new NuvemFiscalClient(credentials)
    const res = await client.get<{ data: NuvemFiscalBill[] }>('/faturas-fornecedor', this.paginationParams(params))
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new NuvemFiscalClient(credentials)
    const res = await client.get<NuvemFiscalBill>(`/faturas-fornecedor/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new NuvemFiscalClient(credentials)
    const [custRes, suppRes] = await Promise.all([
      client.get<{ data: NuvemFiscalCliente[] }>('/clientes', this.paginationParams(params)),
      client.get<{ data: NuvemFiscalFornecedor[] }>('/fornecedores', this.paginationParams(params)),
    ])
    const customers = (custRes.data ?? []).map(transformCustomer)
    const suppliers = (suppRes.data ?? []).map(transformSupplier)
    return [...customers, ...suppliers]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new NuvemFiscalClient(credentials)
    if (id.startsWith('cust_')) {
      const num = id.slice(5)
      const res = await client.get<NuvemFiscalCliente>(`/clientes/${num}`)
      return transformCustomer(res)
    }
    if (id.startsWith('supp_')) {
      const num = id.slice(5)
      const res = await client.get<NuvemFiscalFornecedor>(`/fornecedores/${num}`)
      return transformSupplier(res)
    }
    throw new Error(`Invalid contact id format: ${id}. Expected cust_<n> or supp_<n>`)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new NuvemFiscalClient(credentials)
    if (data.isSupplier && !data.isCustomer) {
      const res = await client.post<NuvemFiscalFornecedor>('/fornecedores', {
        razao_social: data.name,
        cnpj: data.identification,
        email: data.emails?.[0]?.email,
        moeda: data.currency,
      })
      return transformSupplier(res)
    }
    const res = await client.post<NuvemFiscalCliente>('/clientes', {
      razao_social: data.name,
      cnpj: data.identification,
      email: data.emails?.[0]?.email,
      moeda: data.currency,
      endereco: data.billingAddress?.address1,
      cidade: data.billingAddress?.city,
      cep: data.billingAddress?.postalCode,
      pais: data.billingAddress?.country,
    })
    return transformCustomer(res)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const client = new NuvemFiscalClient(credentials)
    if (id.startsWith('supp_')) {
      const num = id.slice(5)
      const res = await client.put<NuvemFiscalFornecedor>(`/fornecedores/${num}`, {
        razao_social: data.name,
        email: data.emails?.[0]?.email,
      })
      return transformSupplier(res)
    }
    const num = id.slice(5)
    const res = await client.put<NuvemFiscalCliente>(`/clientes/${num}`, {
      razao_social: data.name,
      email: data.emails?.[0]?.email,
      endereco: data.billingAddress?.address1,
      cidade: data.billingAddress?.city,
      cep: data.billingAddress?.postalCode,
      pais: data.billingAddress?.country,
    })
    return transformCustomer(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new NuvemFiscalClient(credentials)
    const res = await client.get<{ data: NuvemFiscalAccount[] }>('/contas', this.paginationParams(params))
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new NuvemFiscalClient(credentials)
    const res = await client.get<NuvemFiscalAccount>(`/contas/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new NuvemFiscalClient(credentials)
    const res = await client.get<{ data: NuvemFiscalLancamento[] }>('/lancamentos', this.paginationParams(params))
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new NuvemFiscalClient(credentials)
    const res = await client.get<NuvemFiscalLancamento>(`/lancamentos/${id}`)
    return transformJournal(res)
  }

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const client = new NuvemFiscalClient(credentials)
    const res = await client.post<NuvemFiscalLancamento>('/lancamentos', untransformJournal(data))
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new NuvemFiscalClient(credentials)
    const res = await client.get<{ data: NuvemFiscalMovimentacao[] }>('/movimentacoes', this.paginationParams(params))
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new NuvemFiscalClient(credentials)
    const res = await client.get<NuvemFiscalMovimentacao>(`/movimentacoes/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new NuvemFiscalClient(credentials)
    const res = await client.get<{ data: NuvemFiscalAliquota[] }>('/aliquotas', this.paginationParams(params))
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new NuvemFiscalClient(credentials)
    const res = await client.get<NuvemFiscalAliquota>(`/aliquotas/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new NuvemFiscalClient(credentials)
    const res = await client.get<{ data: NuvemFiscalDespesa[] }>('/despesas', this.paginationParams(params))
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new NuvemFiscalClient(credentials)
    const res = await client.get<NuvemFiscalDespesa>(`/despesas/${id}`)
    return transformExpense(res)
  }

  async createExpense(credentials: Credentials, data: Partial<Expense>): Promise<Expense> {
    const client = new NuvemFiscalClient(credentials)
    const res = await client.post<NuvemFiscalDespesa>('/despesas', untransformExpense(data))
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new NuvemFiscalClient(credentials)
    const res = await client.get<{ data: NuvemFiscalNotaCredito[] }>('/notas-credito', this.paginationParams(params))
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new NuvemFiscalClient(credentials)
    const res = await client.get<NuvemFiscalNotaCredito>(`/notas-credito/${id}`)
    return transformCreditMemo(res)
  }

  async createCreditMemo(credentials: Credentials, data: Partial<CreditMemo>): Promise<CreditMemo> {
    const client = new NuvemFiscalClient(credentials)
    const res = await client.post<NuvemFiscalNotaCredito>('/notas-credito', untransformCreditMemo(data))
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new NuvemFiscalClient(credentials)
    const res = await client.get<{ data: NuvemFiscalPedido[] }>('/pedidos', this.paginationParams(params))
    return (res.data ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new NuvemFiscalClient(credentials)
    const res = await client.get<NuvemFiscalPedido>(`/pedidos/${id}`)
    return transformOrder(res)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new NuvemFiscalClient(credentials)
    const res = await client.post<NuvemFiscalPedido>('/pedidos', untransformOrder(data))
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new NuvemFiscalClient(credentials)
    const res = await client.get<{ data: NuvemFiscalOrdemVenda[] }>('/ordens-venda', this.paginationParams(params))
    return (res.data ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new NuvemFiscalClient(credentials)
    const res = await client.get<NuvemFiscalOrdemVenda>(`/ordens-venda/${id}`)
    return transformSalesOrder(res)
  }

  async createSalesOrder(credentials: Credentials, data: Partial<SalesOrder>): Promise<SalesOrder> {
    const client = new NuvemFiscalClient(credentials)
    const res = await client.post<NuvemFiscalOrdemVenda>('/ordens-venda', untransformSalesOrder(data))
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new NuvemFiscalClient(credentials)
    const res = await client.get<{ data: NuvemFiscalOrdemCompra[] }>('/ordens-compra', this.paginationParams(params))
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new NuvemFiscalClient(credentials)
    const res = await client.get<NuvemFiscalOrdemCompra>(`/ordens-compra/${id}`)
    return transformPurchaseOrder(res)
  }

  async createPurchaseOrder(credentials: Credentials, data: Partial<PurchaseOrder>): Promise<PurchaseOrder> {
    const client = new NuvemFiscalClient(credentials)
    const res = await client.post<NuvemFiscalOrdemCompra>('/ordens-compra', untransformPurchaseOrder(data))
    return transformPurchaseOrder(res)
  }
}
