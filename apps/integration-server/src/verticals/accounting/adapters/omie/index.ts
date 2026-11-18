import { simpleApiKey } from '@opensteward/shared'
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

import {
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  refreshCredentials as doRefreshCredentials,
} from './auth'
import { OmieClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type OmieInvoice } from './transform/invoice'
import { transformBill, type OmieBill } from './transform/bill'
import { transformContact, type OmieContact } from './transform/contact'
import { transformAccount, type OmieAccount } from './transform/account'
import { transformJournal, untransformJournal, type OmieJournal } from './transform/journal'
import { transformOrganization, type OmieOrganization } from './transform/organization'
import { transformTransaction, type OmieTransaction } from './transform/transaction'
import { transformTaxRate, type OmieTaxRate } from './transform/taxrate'
import { transformExpense, untransformExpense, type OmieExpense } from './transform/expense'
import { transformCreditMemo, untransformCreditMemo, type OmieCreditMemo } from './transform/creditmemo'
import { transformOrder, untransformOrder, type OmieOrder } from './transform/order'
import { transformSalesOrder, untransformSalesOrder, type OmieSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, untransformPurchaseOrder, type OmiePurchaseOrder } from './transform/purchaseorder'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class OmieAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'omie'
  readonly version = '0.1.0'

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefreshCredentials(credentials)
  }

  private paginationParam(params: QueryParams): Record<string, unknown> {
    return {
      pagina: params.page ?? 1,
      registros_por_pagina: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new OmieClient(credentials)
    const res = await client.call<{ cadastros: OmieOrganization[] }>(
      'geral/empresas/',
      'ListarEmpresas',
      [{ pagina: 1, registros_por_pagina: 1 }],
    )
    const org = (res.cadastros ?? [])[0]
    if (!org) throw new Error('No organization found')
    return transformOrganization(org)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new OmieClient(credentials)
    const res = await client.call<{ cadastros: OmieInvoice[] }>(
      'geral/notafiscal/',
      'ListarNFe',
      [this.paginationParam(params)],
    )
    return (res.cadastros ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new OmieClient(credentials)
    const res = await client.call<OmieInvoice>(
      'geral/notafiscal/',
      'ConsultarNFe',
      [{ codigo_lancamento: Number(id) }],
    )
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new OmieClient(credentials)
    const res = await client.call<OmieInvoice>(
      'geral/notafiscal/',
      'IncluirNFe',
      [untransformInvoice(data)],
    )
    return transformInvoice(res)
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new OmieClient(credentials)
    const body = { ...untransformInvoice(data), codigo_lancamento: Number(id) }
    const res = await client.call<OmieInvoice>(
      'geral/notafiscal/',
      'AlterarNFe',
      [body],
    )
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new OmieClient(credentials)
    const res = await client.call<{ cadastros: OmieBill[] }>(
      'financas/contapagar/',
      'ListarContasPagar',
      [this.paginationParam(params)],
    )
    return (res.cadastros ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new OmieClient(credentials)
    const res = await client.call<OmieBill>(
      'financas/contapagar/',
      'ConsultarContaPagar',
      [{ codigo_lancamento: Number(id) }],
    )
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new OmieClient(credentials)
    const res = await client.call<{ clientes_cadastro: OmieContact[] }>(
      'geral/clientes/',
      'ListarClientes',
      [this.paginationParam(params)],
    )
    return (res.clientes_cadastro ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new OmieClient(credentials)
    const res = await client.call<OmieContact>(
      'geral/clientes/',
      'ConsultarCliente',
      [{ codigo_cliente: Number(id) }],
    )
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new OmieClient(credentials)
    const res = await client.call<OmieContact>(
      'geral/clientes/',
      'IncluirCliente',
      [{
        razao_social: data.name,
        cnpj_cpf: data.identification,
        email: data.emails?.[0]?.email,
        endereco: data.billingAddress?.address1,
        cidade: data.billingAddress?.city,
        cep: data.billingAddress?.postalCode,
        estado: data.billingAddress?.region,
      }],
    )
    return transformContact(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new OmieClient(credentials)
    const res = await client.call<OmieContact>(
      'geral/clientes/',
      'AlterarCliente',
      [{
        codigo_cliente: Number(id),
        razao_social: data.name,
        email: data.emails?.[0]?.email,
      }],
    )
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new OmieClient(credentials)
    const res = await client.call<{ cadastros: OmieAccount[] }>(
      'contabilidade/planocontas/',
      'ListarPlanoContas',
      [this.paginationParam(params)],
    )
    return (res.cadastros ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new OmieClient(credentials)
    const res = await client.call<OmieAccount>(
      'contabilidade/planocontas/',
      'ConsultarPlanoConta',
      [{ codigo: Number(id) }],
    )
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new OmieClient(credentials)
    const res = await client.call<{ cadastros: OmieJournal[] }>(
      'contabilidade/lancamentos/',
      'ListarLancamentos',
      [this.paginationParam(params)],
    )
    return (res.cadastros ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new OmieClient(credentials)
    const res = await client.call<OmieJournal>(
      'contabilidade/lancamentos/',
      'ConsultarLancamento',
      [{ codigo_lancamento: Number(id) }],
    )
    return transformJournal(res)
  }

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const client = new OmieClient(credentials)
    const res = await client.call<OmieJournal>(
      'contabilidade/lancamentos/',
      'IncluirLancamento',
      [untransformJournal(data)],
    )
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new OmieClient(credentials)
    const res = await client.call<{ cadastros: OmieTransaction[] }>(
      'financas/extrato/',
      'ListarExtrato',
      [this.paginationParam(params)],
    )
    return (res.cadastros ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new OmieClient(credentials)
    const res = await client.call<OmieTransaction>(
      'financas/extrato/',
      'ConsultarExtrato',
      [{ codigo_lancamento: Number(id) }],
    )
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new OmieClient(credentials)
    const res = await client.call<{ cadastros: OmieTaxRate[] }>(
      'geral/impostos/',
      'ListarImpostos',
      [this.paginationParam(params)],
    )
    return (res.cadastros ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new OmieClient(credentials)
    const res = await client.call<OmieTaxRate>(
      'geral/impostos/',
      'ConsultarImposto',
      [{ codigo_imposto: Number(id) }],
    )
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new OmieClient(credentials)
    const res = await client.call<{ cadastros: OmieExpense[] }>(
      'financas/despesas/',
      'ListarDespesas',
      [this.paginationParam(params)],
    )
    return (res.cadastros ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new OmieClient(credentials)
    const res = await client.call<OmieExpense>(
      'financas/despesas/',
      'ConsultarDespesa',
      [{ codigo_lancamento: Number(id) }],
    )
    return transformExpense(res)
  }

  async createExpense(credentials: Credentials, data: Partial<Expense>): Promise<Expense> {
    const client = new OmieClient(credentials)
    const res = await client.call<OmieExpense>(
      'financas/despesas/',
      'IncluirDespesa',
      [untransformExpense(data)],
    )
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new OmieClient(credentials)
    const res = await client.call<{ cadastros: OmieCreditMemo[] }>(
      'geral/notacredito/',
      'ListarNotasCredito',
      [this.paginationParam(params)],
    )
    return (res.cadastros ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new OmieClient(credentials)
    const res = await client.call<OmieCreditMemo>(
      'geral/notacredito/',
      'ConsultarNotaCredito',
      [{ codigo_lancamento: Number(id) }],
    )
    return transformCreditMemo(res)
  }

  async createCreditMemo(
    credentials: Credentials,
    data: Partial<CreditMemo>,
  ): Promise<CreditMemo> {
    const client = new OmieClient(credentials)
    const res = await client.call<OmieCreditMemo>(
      'geral/notacredito/',
      'IncluirNotaCredito',
      [untransformCreditMemo(data)],
    )
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new OmieClient(credentials)
    const res = await client.call<{ cadastros: OmieOrder[] }>(
      'produtos/pedido/',
      'ListarPedidos',
      [this.paginationParam(params)],
    )
    return (res.cadastros ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new OmieClient(credentials)
    const res = await client.call<OmieOrder>(
      'produtos/pedido/',
      'ConsultarPedido',
      [{ codigo_pedido: Number(id) }],
    )
    return transformOrder(res)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new OmieClient(credentials)
    const res = await client.call<OmieOrder>(
      'produtos/pedido/',
      'IncluirPedido',
      [untransformOrder(data)],
    )
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new OmieClient(credentials)
    const res = await client.call<{ cadastros: OmieSalesOrder[] }>(
      'produtos/pedidovenda/',
      'ListarPedidosVenda',
      [this.paginationParam(params)],
    )
    return (res.cadastros ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new OmieClient(credentials)
    const res = await client.call<OmieSalesOrder>(
      'produtos/pedidovenda/',
      'ConsultarPedidoVenda',
      [{ codigo_pedido: Number(id) }],
    )
    return transformSalesOrder(res)
  }

  async createSalesOrder(
    credentials: Credentials,
    data: Partial<SalesOrder>,
  ): Promise<SalesOrder> {
    const client = new OmieClient(credentials)
    const res = await client.call<OmieSalesOrder>(
      'produtos/pedidovenda/',
      'IncluirPedidoVenda',
      [untransformSalesOrder(data)],
    )
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const client = new OmieClient(credentials)
    const res = await client.call<{ cadastros: OmiePurchaseOrder[] }>(
      'produtos/pedidocompra/',
      'ListarPedidosCompra',
      [this.paginationParam(params)],
    )
    return (res.cadastros ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new OmieClient(credentials)
    const res = await client.call<OmiePurchaseOrder>(
      'produtos/pedidocompra/',
      'ConsultarPedidoCompra',
      [{ codigo_pedido: Number(id) }],
    )
    return transformPurchaseOrder(res)
  }

  async createPurchaseOrder(
    credentials: Credentials,
    data: Partial<PurchaseOrder>,
  ): Promise<PurchaseOrder> {
    const client = new OmieClient(credentials)
    const res = await client.call<OmiePurchaseOrder>(
      'produtos/pedidocompra/',
      'IncluirPedidoCompra',
      [untransformPurchaseOrder(data)],
    )
    return transformPurchaseOrder(res)
  }
}
