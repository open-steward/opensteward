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
import type { Organization } from '../../schema/organization'

import {
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  refreshCredentials as doRefreshCredentials,
} from './auth'
import { WaveClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type WaveInvoice } from './transform/invoice'
import { transformBill, type WaveBill } from './transform/bill'
import { transformContact, type WaveContact } from './transform/contact'
import { transformAccount, type WaveAccount } from './transform/account'
import { transformJournal, type WaveJournal } from './transform/journal'
import { transformOrganization, type WaveOrganization } from './transform/organization'
import { transformExpense, type WaveExpense } from './transform/expense'
import { transformTaxRate, type WaveTaxRate } from './transform/taxrate'
import { transformTransaction, type WaveTransaction } from './transform/transaction'
import { transformCreditMemo, type WaveCreditMemo } from './transform/creditmemo'

export class WaveAdapter implements AccountingAdapter {
  readonly platform = 'wave'
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

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new WaveClient(credentials)
    const res = await client.query<{ business: WaveOrganization }>(
      `query($businessId: ID!) {
        business(id: $businessId) {
          id name
          currency { code }
          address {
            addressLine1 city
            province { code }
            postalCode
            country { code }
          }
        }
      }`,
      { businessId: credentials.tenantId },
    )
    return transformOrganization(res.business)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new WaveClient(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = params.page ?? 1
    const res = await client.query<{
      business: { invoices: { edges: { node: WaveInvoice }[] } }
    }>(
      `query($businessId: ID!, $page: Int!, $pageSize: Int!) {
        business(id: $businessId) {
          invoices(page: $page, pageSize: $pageSize) {
            edges {
              node {
                id invoiceNumber status
                customer { id }
                currency { code }
                totalAmount taxAmount amountDue amountPaid
                items {
                  id description quantity unitPrice amount
                  account { id }
                  taxes { amount salesTax { id name rate } }
                }
                invoiceDate dueDate createdAt modifiedAt
              }
            }
          }
        }
      }`,
      { businessId: credentials.tenantId, page, pageSize: limit },
    )
    return (res.business.invoices.edges ?? []).map((e) => transformInvoice(e.node))
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new WaveClient(credentials)
    const res = await client.query<{ business: { invoice: WaveInvoice } }>(
      `query($businessId: ID!, $invoiceId: ID!) {
        business(id: $businessId) {
          invoice(id: $invoiceId) {
            id invoiceNumber status
            customer { id }
            currency { code }
            totalAmount taxAmount amountDue amountPaid
            items {
              id description quantity unitPrice amount
              account { id }
              taxes { amount salesTax { id name rate } }
            }
            invoiceDate dueDate createdAt modifiedAt
          }
        }
      }`,
      { businessId: credentials.tenantId, invoiceId: id },
    )
    return transformInvoice(res.business.invoice)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new WaveClient(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = params.page ?? 1
    const res = await client.query<{
      business: { bills: { edges: { node: WaveBill }[] } }
    }>(
      `query($businessId: ID!, $page: Int!, $pageSize: Int!) {
        business(id: $businessId) {
          bills(page: $page, pageSize: $pageSize) {
            edges {
              node {
                id billNumber status
                vendor { id }
                currency { code }
                totalAmount amountDue amountPaid
                invoiceDate dueDate createdAt modifiedAt
              }
            }
          }
        }
      }`,
      { businessId: credentials.tenantId, page, pageSize: limit },
    )
    return (res.business.bills.edges ?? []).map((e) => transformBill(e.node))
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new WaveClient(credentials)
    const res = await client.query<{ business: { bill: WaveBill } }>(
      `query($businessId: ID!, $billId: ID!) {
        business(id: $businessId) {
          bill(id: $billId) {
            id billNumber status
            vendor { id }
            currency { code }
            totalAmount amountDue amountPaid
            invoiceDate dueDate createdAt modifiedAt
          }
        }
      }`,
      { businessId: credentials.tenantId, billId: id },
    )
    return transformBill(res.business.bill)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new WaveClient(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = params.page ?? 1
    const res = await client.query<{
      business: { customers: { edges: { node: WaveContact }[] } }
    }>(
      `query($businessId: ID!, $page: Int!, $pageSize: Int!) {
        business(id: $businessId) {
          customers(page: $page, pageSize: $pageSize) {
            edges {
              node {
                id name firstName lastName email phone
                currency { code }
                address {
                  addressLine1 city
                  province { code }
                  postalCode
                  country { code }
                }
                createdAt modifiedAt
              }
            }
          }
        }
      }`,
      { businessId: credentials.tenantId, page, pageSize: limit },
    )
    return (res.business.customers.edges ?? []).map((e) => transformContact(e.node))
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new WaveClient(credentials)
    const res = await client.query<{ business: { customer: WaveContact } }>(
      `query($businessId: ID!, $customerId: ID!) {
        business(id: $businessId) {
          customer(id: $customerId) {
            id name firstName lastName email phone
            currency { code }
            address {
              addressLine1 city
              province { code }
              postalCode
              country { code }
            }
            createdAt modifiedAt
          }
        }
      }`,
      { businessId: credentials.tenantId, customerId: id },
    )
    return transformContact(res.business.customer)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new WaveClient(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = params.page ?? 1
    const res = await client.query<{
      business: { accounts: { edges: { node: WaveAccount }[] } }
    }>(
      `query($businessId: ID!, $page: Int!, $pageSize: Int!) {
        business(id: $businessId) {
          accounts(page: $page, pageSize: $pageSize) {
            edges {
              node {
                id name description isArchived
                type { value }
                subtype { value }
                currency { code }
              }
            }
          }
        }
      }`,
      { businessId: credentials.tenantId, page, pageSize: limit },
    )
    return (res.business.accounts.edges ?? []).map((e) => transformAccount(e.node))
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new WaveClient(credentials)
    const res = await client.query<{ business: { account: WaveAccount } }>(
      `query($businessId: ID!, $accountId: ID!) {
        business(id: $businessId) {
          account(id: $accountId) {
            id name description isArchived
            type { value }
            subtype { value }
            currency { code }
          }
        }
      }`,
      { businessId: credentials.tenantId, accountId: id },
    )
    return transformAccount(res.business.account)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new WaveClient(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = params.page ?? 1
    const res = await client.query<{
      business: { journalEntries: { edges: { node: WaveJournal }[] } }
    }>(
      `query($businessId: ID!, $page: Int!, $pageSize: Int!) {
        business(id: $businessId) {
          journalEntries(page: $page, pageSize: $pageSize) {
            edges {
              node {
                id entryDate description reference
                currency { code }
                lines { id accountId description debit credit }
                createdAt modifiedAt
              }
            }
          }
        }
      }`,
      { businessId: credentials.tenantId, page, pageSize: limit },
    )
    return (res.business.journalEntries.edges ?? []).map((e) => transformJournal(e.node))
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new WaveClient(credentials)
    const res = await client.query<{ business: { journalEntry: WaveJournal } }>(
      `query($businessId: ID!, $entryId: ID!) {
        business(id: $businessId) {
          journalEntry(id: $entryId) {
            id entryDate description reference
            currency { code }
            lines { id accountId description debit credit }
            createdAt modifiedAt
          }
        }
      }`,
      { businessId: credentials.tenantId, entryId: id },
    )
    return transformJournal(res.business.journalEntry)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new WaveClient(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = params.page ?? 1
    const res = await client.query<{
      business: { transactions: { edges: { node: WaveTransaction }[] } }
    }>(
      `query($businessId: ID!, $page: Int!, $pageSize: Int!) {
        business(id: $businessId) {
          transactions(page: $page, pageSize: $pageSize) {
            edges {
              node {
                id accountId description amount type date
                currency { code }
                createdAt modifiedAt
              }
            }
          }
        }
      }`,
      { businessId: credentials.tenantId, page, pageSize: limit },
    )
    return (res.business.transactions.edges ?? []).map((e) => transformTransaction(e.node))
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new WaveClient(credentials)
    const res = await client.query<{ business: { transaction: WaveTransaction } }>(
      `query($businessId: ID!, $transactionId: ID!) {
        business(id: $businessId) {
          transaction(id: $transactionId) {
            id accountId description amount type date
            currency { code }
            createdAt modifiedAt
          }
        }
      }`,
      { businessId: credentials.tenantId, transactionId: id },
    )
    return transformTransaction(res.business.transaction)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new WaveClient(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = params.page ?? 1
    const res = await client.query<{
      business: { salesTaxes: { edges: { node: WaveTaxRate }[] } }
    }>(
      `query($businessId: ID!, $page: Int!, $pageSize: Int!) {
        business(id: $businessId) {
          salesTaxes(page: $page, pageSize: $pageSize) {
            edges {
              node { id name rate isActive }
            }
          }
        }
      }`,
      { businessId: credentials.tenantId, page, pageSize: limit },
    )
    return (res.business.salesTaxes.edges ?? []).map((e) => transformTaxRate(e.node))
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new WaveClient(credentials)
    const res = await client.query<{ business: { salesTax: WaveTaxRate } }>(
      `query($businessId: ID!, $taxId: ID!) {
        business(id: $businessId) {
          salesTax(id: $taxId) {
            id name rate isActive
          }
        }
      }`,
      { businessId: credentials.tenantId, taxId: id },
    )
    return transformTaxRate(res.business.salesTax)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new WaveClient(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = params.page ?? 1
    const res = await client.query<{
      business: { expenses: { edges: { node: WaveExpense }[] } }
    }>(
      `query($businessId: ID!, $page: Int!, $pageSize: Int!) {
        business(id: $businessId) {
          expenses(page: $page, pageSize: $pageSize) {
            edges {
              node {
                id description accountId totalAmount taxAmount expenseDate
                vendor { id }
                currency { code }
                createdAt modifiedAt
              }
            }
          }
        }
      }`,
      { businessId: credentials.tenantId, page, pageSize: limit },
    )
    return (res.business.expenses.edges ?? []).map((e) => transformExpense(e.node))
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new WaveClient(credentials)
    const res = await client.query<{ business: { expense: WaveExpense } }>(
      `query($businessId: ID!, $expenseId: ID!) {
        business(id: $businessId) {
          expense(id: $expenseId) {
            id description accountId totalAmount taxAmount expenseDate
            vendor { id }
            currency { code }
            createdAt modifiedAt
          }
        }
      }`,
      { businessId: credentials.tenantId, expenseId: id },
    )
    return transformExpense(res.business.expense)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new WaveClient(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = params.page ?? 1
    const res = await client.query<{
      business: { creditNotes: { edges: { node: WaveCreditMemo }[] } }
    }>(
      `query($businessId: ID!, $page: Int!, $pageSize: Int!) {
        business(id: $businessId) {
          creditNotes(page: $page, pageSize: $pageSize) {
            edges {
              node {
                id creditNoteNumber status
                customer { id }
                currency { code }
                totalAmount amountDue amountPaid
                invoiceDate createdAt modifiedAt
              }
            }
          }
        }
      }`,
      { businessId: credentials.tenantId, page, pageSize: limit },
    )
    return (res.business.creditNotes.edges ?? []).map((e) => transformCreditMemo(e.node))
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new WaveClient(credentials)
    const res = await client.query<{ business: { creditNote: WaveCreditMemo } }>(
      `query($businessId: ID!, $creditNoteId: ID!) {
        business(id: $businessId) {
          creditNote(id: $creditNoteId) {
            id creditNoteNumber status
            customer { id }
            currency { code }
            totalAmount amountDue amountPaid
            invoiceDate createdAt modifiedAt
          }
        }
      }`,
      { businessId: credentials.tenantId, creditNoteId: id },
    )
    return transformCreditMemo(res.business.creditNote)
  }
}
