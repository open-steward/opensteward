/**
 * vhsys accounting adapter.
 *
 * vhsys is a Brazilian ERP/accounting platform for SMEs. It uses a custom
 * API-key pair ("access-token" + "secret-access-token") that the user obtains
 * from their account settings. There is no OAuth flow.
 *
 * Supported resources:
 *   - Organization   (GET /empresa)
 *   - Contacts       (GET /clientes, GET /fornecedores)
 *   - Invoices       (GET/POST/PUT /pedidos)
 *   - Bills          (GET /contas_pagar)
 *   - Accounts       (GET /contas_bancarias)
 *   - Transactions   (GET /contas_receber)
 *   - Orders         (GET /pedidos)
 *   - Sales Orders   (GET /pedidos)
 *   - Purchase Orders(GET /ordens_compra)
 *   - Credit Memos   (GET /devolucoes)
 *   - Expenses       (GET /contas_pagar — type=despesa)
 *   - Tax Rates      (GET /tributacoes)
 *
 * Resources NOT supported (return 501 automatically via missing implementation):
 *   - Journals (no dedicated endpoint; financial moves are in contas_receber/contas_pagar)
 */
// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: journal — vhsys has no dedicated journal/lancamento-contabil REST endpoint;
//              accounting journal data is exchanged only via proprietary integrations
//              (Questor, Cordilheira) outside the public API
import { customForm } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Transaction } from '../../schema/transaction'
import type { TaxRate } from '../../schema/taxrate'
import type { Expense } from '../../schema/expense'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Order } from '../../schema/order'
import type { SalesOrder } from '../../schema/salesorder'
import type { PurchaseOrder } from '../../schema/purchaseorder'
import type { Organization } from '../../schema/organization'

import { getAuthUrl, exchangeCode as doExchangeCode, refreshCredentials as doRefreshCredentials } from './auth'
import { VhsysClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type VhsysPedido } from './transform/invoice'
import { transformBill, type VhsysContaPagar } from './transform/bill'
import { transformCliente, transformFornecedor, type VhsysCliente, type VhsysFornecedor } from './transform/contact'
import { transformAccount, type VhsysContaBancaria } from './transform/account'
import { transformOrganization, type VhsysEmpresa } from './transform/organization'
import { transformTransaction, type VhsysContaReceber } from './transform/transaction'
import { transformTaxRate, type VhsysTributacao } from './transform/taxrate'
import { transformExpense, type VhsysContaPagarDespesa } from './transform/expense'
import { transformCreditMemo, type VhsysDevolucao } from './transform/creditmemo'
import { transformOrder, type VhsysPedidoOrder } from './transform/order'
import { transformSalesOrder, type VhsysPedidoSales } from './transform/salesorder'
import { transformPurchaseOrder, type VhsysOrdemCompra } from './transform/purchaseorder'

// ── Connect Link (simpleApiKey form) ─────────────────────────────────────────
//
// The customer enters "access-token:secret-access-token" in the single field.
// simpleApiKey stores the full string as credentials.accessToken; auth.ts
// splits it when exchangeCode is called.

const SIMPLE_KEY_FORM = customForm({
  fields: [
    {
      name: 'apiKey',
      label: 'Access Token : Secret Access Token',
      type: 'password',
      placeholder: 'access-token:secret-access-token',
      helpText:
        'Combine your vhsys Access Token and Secret Access Token with a colon, e.g. abc123:xyz789. Find these in your vhsys account under Configurações → Integração via API.',
      required: true,
    },
  ],
  async exchange(fields) {
    const raw = (fields['apiKey'] ?? '').trim()
    if (!raw) throw new Error('Access Token : Secret Access Token is required.')
    return doExchangeCode(raw)
  },
})

// ── Adapter config ────────────────────────────────────────────────────────────

// vhsys API key pairs are static (no OAuth client required).
// The constructor accepts an empty config for symmetry with the factory helper.
interface VhsysAdapterConfig {
  accessToken?: string
  secretAccessToken?: string
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class VhsysAdapter implements AccountingAdapter {
  // Connect Link form support
  credentialFields = SIMPLE_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_KEY_FORM.exchangeCredentials

  readonly platform = 'vhsys'
  readonly version = '0.1.0'

  constructor(_config: VhsysAdapterConfig = {}) {}

  getAuthUrl(_state: string): string {
    return getAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefreshCredentials(credentials)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      offset: ((params.page ?? 1) - 1) * Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    }
  }

  // ── Organization ───────────────────────────────────────────────────────────

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new VhsysClient(credentials)
    const res = await client.get<VhsysEmpresa>('empresa')
    return transformOrganization(res)
  }

  // ── Invoices ───────────────────────────────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new VhsysClient(credentials)
    const res = await client.get<VhsysPedido[]>('pedidos', this.paginationParams(params))
    return (Array.isArray(res) ? res : []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new VhsysClient(credentials)
    const res = await client.get<VhsysPedido>(`pedidos/${id}`)
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new VhsysClient(credentials)
    const res = await client.post<VhsysPedido>('pedidos', untransformInvoice(data))
    return transformInvoice(res)
  }

  async updateInvoice(credentials: Credentials, id: string, data: Partial<Invoice>): Promise<Invoice> {
    const client = new VhsysClient(credentials)
    const res = await client.put<VhsysPedido>(`pedidos/${id}`, untransformInvoice(data))
    return transformInvoice(res)
  }

  // ── Bills ──────────────────────────────────────────────────────────────────

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new VhsysClient(credentials)
    const res = await client.get<VhsysContaPagar[]>('contas_pagar', this.paginationParams(params))
    return (Array.isArray(res) ? res : []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new VhsysClient(credentials)
    const res = await client.get<VhsysContaPagar>(`contas_pagar/${id}`)
    return transformBill(res)
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new VhsysClient(credentials)
    const [clienteRes, fornecedorRes] = await Promise.all([
      client.get<VhsysCliente[]>('clientes', this.paginationParams(params)),
      client.get<VhsysFornecedor[]>('fornecedores', this.paginationParams(params)),
    ])
    const clientes = (Array.isArray(clienteRes) ? clienteRes : []).map(transformCliente)
    const fornecedores = (Array.isArray(fornecedorRes) ? fornecedorRes : []).map(transformFornecedor)
    return [...clientes, ...fornecedores]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new VhsysClient(credentials)
    if (id.startsWith('supp_')) {
      const num = id.slice(5)
      const res = await client.get<VhsysFornecedor>(`fornecedores/${num}`)
      return transformFornecedor(res)
    }
    const res = await client.get<VhsysCliente>(`clientes/${id}`)
    return transformCliente(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new VhsysClient(credentials)
    if (data.isSupplier && !data.isCustomer) {
      const res = await client.post<VhsysFornecedor>('fornecedores', {
        razao_fornecedor: data.name,
        email_fornecedor: data.emails?.[0]?.email,
        fone_fornecedor: data.telephones?.[0]?.telephone,
        endereco_fornecedor: data.billingAddress?.address1,
        cidade_fornecedor: data.billingAddress?.city,
        cep_fornecedor: data.billingAddress?.postalCode,
      })
      return transformFornecedor(res)
    }
    const res = await client.post<VhsysCliente>('clientes', {
      razao_cliente: data.name,
      email_cliente: data.emails?.[0]?.email,
      fone_cliente: data.telephones?.[0]?.telephone,
      endereco_cliente: data.billingAddress?.address1,
      cidade_cliente: data.billingAddress?.city,
      cep_cliente: data.billingAddress?.postalCode,
    })
    return transformCliente(res)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const client = new VhsysClient(credentials)
    if (id.startsWith('supp_')) {
      const num = id.slice(5)
      const res = await client.put<VhsysFornecedor>(`fornecedores/${num}`, {
        razao_fornecedor: data.name,
        email_fornecedor: data.emails?.[0]?.email,
      })
      return transformFornecedor(res)
    }
    const res = await client.put<VhsysCliente>(`clientes/${id}`, {
      razao_cliente: data.name,
      email_cliente: data.emails?.[0]?.email,
    })
    return transformCliente(res)
  }

  // ── Accounts ───────────────────────────────────────────────────────────────

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new VhsysClient(credentials)
    const res = await client.get<VhsysContaBancaria[]>('contas_bancarias', this.paginationParams(params))
    return (Array.isArray(res) ? res : []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new VhsysClient(credentials)
    const res = await client.get<VhsysContaBancaria>(`contas_bancarias/${id}`)
    return transformAccount(res)
  }

  // ── Transactions (Contas a Receber) ────────────────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new VhsysClient(credentials)
    const res = await client.get<VhsysContaReceber[]>('contas_receber', this.paginationParams(params))
    return (Array.isArray(res) ? res : []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new VhsysClient(credentials)
    const res = await client.get<VhsysContaReceber>(`contas_receber/${id}`)
    return transformTransaction(res)
  }

  // ── Tax Rates ──────────────────────────────────────────────────────────────

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new VhsysClient(credentials)
    const res = await client.get<VhsysTributacao[]>('tributacoes', this.paginationParams(params))
    return (Array.isArray(res) ? res : []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new VhsysClient(credentials)
    const res = await client.get<VhsysTributacao>(`tributacoes/${id}`)
    return transformTaxRate(res)
  }

  // ── Expenses ───────────────────────────────────────────────────────────────

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new VhsysClient(credentials)
    // vhsys bills (contas_pagar) include operating expenses; filter by tipo=despesa when supported
    const res = await client.get<VhsysContaPagarDespesa[]>('contas_pagar', {
      ...this.paginationParams(params),
      tipo: 'despesa',
    })
    return (Array.isArray(res) ? res : []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new VhsysClient(credentials)
    const res = await client.get<VhsysContaPagarDespesa>(`contas_pagar/${id}`)
    return transformExpense(res)
  }

  // ── Credit Memos ───────────────────────────────────────────────────────────

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new VhsysClient(credentials)
    const res = await client.get<VhsysDevolucao[]>('devolucoes', this.paginationParams(params))
    return (Array.isArray(res) ? res : []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new VhsysClient(credentials)
    const res = await client.get<VhsysDevolucao>(`devolucoes/${id}`)
    return transformCreditMemo(res)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new VhsysClient(credentials)
    const res = await client.get<VhsysPedidoOrder[]>('pedidos', this.paginationParams(params))
    return (Array.isArray(res) ? res : []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new VhsysClient(credentials)
    const res = await client.get<VhsysPedidoOrder>(`pedidos/${id}`)
    return transformOrder(res)
  }

  // ── Sales Orders ───────────────────────────────────────────────────────────

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new VhsysClient(credentials)
    const res = await client.get<VhsysPedidoSales[]>('pedidos', this.paginationParams(params))
    return (Array.isArray(res) ? res : []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new VhsysClient(credentials)
    const res = await client.get<VhsysPedidoSales>(`pedidos/${id}`)
    return transformSalesOrder(res)
  }

  // ── Purchase Orders ────────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new VhsysClient(credentials)
    const res = await client.get<VhsysOrdemCompra[]>('ordens_compra', this.paginationParams(params))
    return (Array.isArray(res) ? res : []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new VhsysClient(credentials)
    const res = await client.get<VhsysOrdemCompra>(`ordens_compra/${id}`)
    return transformPurchaseOrder(res)
  }
}
