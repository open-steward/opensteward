import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { Transaction } from '../../schema/transaction'
import type { Organization } from '../../schema/organization'

import { CREDENTIAL_FORM, buildAuthUrl, exchangeCode as doExchangeCode, refreshCredentials as doRefresh } from './auth'
import { TallyClient } from './client'
import { TALLY_DEFAULT_PORT, TALLY_EARLIEST_DATE } from './constants'

import { transformInvoice, type TallyInvoice } from './transform/invoice'
import { transformBill, type TallyBill } from './transform/bill'
import { transformContact, type TallyLedger } from './transform/contact'
import { transformAccount } from './transform/account'
import { transformJournal, type TallyJournal, type TallyJournalEntry } from './transform/journal'
import { transformTransaction, type TallyTransaction } from './transform/transaction'
import { transformOrganization, type TallyOrganization } from './transform/organization'

interface TallyAdapterConfig {
  host?: string
  port?: number
  redirectUri?: string
  scopes?: string[]
}

// Minimal XML envelope for Tally requests
function buildXml(body: string): string {
  return `<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY>${body}</BODY></ENVELOPE>`
}

function exportXml(reportName: string, svgType: string, filters = ''): string {
  return buildXml(`<EXPORTDATA><REQUESTDESC><REPORTNAME>${reportName}</REPORTNAME><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>${svgType}${filters}</STATICVARIABLES></REQUESTDESC></EXPORTDATA>`)
}

// ── Voucher export (documented Export/Collection request) ──────────────────
//
// Bills, journals and transactions all read from the same documented request
// shape: a TDL Collection of TYPE=Voucher, filtered by VoucherTypeName, sent
// as `TALLYREQUEST=Export` / `TYPE=Collection` (voucher-collection-payload).
// This is deliberately NOT invoice's `TALLYREQUEST=Export Data` +
// REPORTNAME='Voucher Register' + SVVOUCHERTYPE request above: that shape
// appears in none of the saved vendor docs and its report strips
// ALLLEDGERENTRIES.LIST, which journal line items need.

/** Tally's STATICVARIABLES date format: YYYYMMDD, no separators. */
function formatTallyDate(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

/**
 * A TDL formula matching one voucher by GUID OR MASTERID — the two unique
 * identifiers a voucher export carries. VOUCHERNUMBER is deliberately not
 * used here: it resets per book/voucher-type, so it can collide across
 * unrelated vouchers.
 */
function voucherIdFilter(id: string): string {
  return `$Guid = "${id}" OR $MasterId = "${id}"`
}

/**
 * Builds the documented Export/Collection Type=Voucher request. `params`
 * bounds SVFROMDATE at `updatedAfter` (or a wide default so a plain list
 * isn't silently scoped to Tally's currently-active UI period); SVTODATE is
 * always "now" — QueryParams has no upper-bound field.
 *
 * `extraFilter` (used by the get* methods) is ANDed with the voucher-type
 * filter so a single-voucher lookup still only ever matches its own type.
 */
function voucherCollectionXml(
  voucherTypeFilter: string,
  params: QueryParams = {},
  extraFilter?: string,
): string {
  const from = params.updatedAfter ? formatTallyDate(params.updatedAfter) : TALLY_EARLIEST_DATE
  const to = formatTallyDate(new Date())
  const filter = extraFilter ? `(${voucherTypeFilter}) AND (${extraFilter})` : voucherTypeFilter
  return (
    '<ENVELOPE>' +
    '<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>OSVouchers</ID></HEADER>' +
    '<BODY><DESC>' +
    '<STATICVARIABLES>' +
    '<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>' +
    `<SVFROMDATE TYPE="Date">${from}</SVFROMDATE>` +
    `<SVTODATE TYPE="Date">${to}</SVTODATE>` +
    '</STATICVARIABLES>' +
    '<TDL><TDLMESSAGE>' +
    '<COLLECTION NAME="OSVouchers" ISMODIFY="No">' +
    '<TYPE>Voucher</TYPE>' +
    // Over-specified on purpose: several of these (VOUCHERNUMBER, DATE,
    // PARTYLEDGERNAME, AMOUNT, NARRATION) are native fields that a full
    // voucher XML dump includes without a FETCH, but that can't be verified
    // without a live Tally connection (see file-header AUDIT notes), and a
    // redundant FETCH entry is harmless.
    '<FETCH>GUID,MASTERID,VOUCHERNUMBER,VOUCHERTYPENAME,DATE,PARTYLEDGERNAME,AMOUNT,NARRATION,ALLLEDGERENTRIES.LIST</FETCH>' +
    '<FILTER>OSVoucherFilter</FILTER>' +
    '</COLLECTION>' +
    `<SYSTEM TYPE="Formulae" NAME="OSVoucherFilter">${filter}</SYSTEM>` +
    '</TDLMESSAGE></TDL>' +
    '</DESC></BODY>' +
    '</ENVELOPE>'
  )
}

interface TallyVoucherBlock {
  GUID: string
  MASTERID: string
  VOUCHERNUMBER: string
  VOUCHERTYPENAME: string
  PARTYLEDGERNAME: string
  DATE: string
  AMOUNT: string
  NARRATION: string
  ALLLEDGERENTRIES: TallyJournalEntry[]
}

/**
 * Parses `<VOUCHER>...</VOUCHER>` blocks out of a Collection export, including
 * nested `<ALLLEDGERENTRIES.LIST>` — which invoice's regex parser (above)
 * never looks for.
 *
 * Ledger-entry blocks are stripped before the header fields are read so a
 * line's own `<AMOUNT>`/`<NARRATION>` can never be mistaken for the voucher
 * header's — a plain first-match regex over the whole block is order-
 * dependent on field placement Tally does not contractually guarantee.
 */
function parseVoucherBlocks(xml: string): TallyVoucherBlock[] {
  const blocks: TallyVoucherBlock[] = []
  // The opening tag is captured alongside the body because Tally puts some
  // identifiers on the `<VOUCHER …>` tag as ATTRIBUTES rather than as child
  // elements, and which of the two it uses for GUID/MASTERID is unconfirmed
  // (it needs a live instance to settle). Reading both
  // positions removes the dependency on the answer: whichever Tally emits, the
  // id is found, and the element form still wins when both are present.
  const voucherMatches = xml.matchAll(/<VOUCHER([^>]*)>([\s\S]*?)<\/VOUCHER>/g)
  for (const voucherMatch of voucherMatches) {
    const openTag = voucherMatch[1] ?? ''
    const body = voucherMatch[2]
    const attr = (name: string): string =>
      new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i').exec(openTag)?.[1] ??
      new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, 'i').exec(openTag)?.[1] ??
      ''

    const entries: TallyJournalEntry[] = []
    const entryMatches = body.matchAll(/<ALLLEDGERENTRIES\.LIST[^>]*>([\s\S]*?)<\/ALLLEDGERENTRIES\.LIST>/g)
    for (const entryMatch of entryMatches) {
      const entryBody = entryMatch[1]
      entries.push({
        LEDGERNAME: entryBody.match(/<LEDGERNAME>(.*?)<\/LEDGERNAME>/)?.[1] ?? '',
        AMOUNT: entryBody.match(/<AMOUNT>(.*?)<\/AMOUNT>/)?.[1] ?? '0',
        ISDEEMEDPOSITIVE: entryBody.match(/<ISDEEMEDPOSITIVE>(.*?)<\/ISDEEMEDPOSITIVE>/)?.[1] ?? 'No',
      })
    }

    const header = body.replace(/<ALLLEDGERENTRIES\.LIST[^>]*>[\s\S]*?<\/ALLLEDGERENTRIES\.LIST>/g, '')
    blocks.push({
      // Element first, attribute as the fallback — see the note above.
      GUID: header.match(/<GUID>(.*?)<\/GUID>/)?.[1] || attr('GUID'),
      MASTERID: header.match(/<MASTERID>(.*?)<\/MASTERID>/)?.[1] || attr('MASTERID'),
      VOUCHERNUMBER: header.match(/<VOUCHERNUMBER>(.*?)<\/VOUCHERNUMBER>/)?.[1] ?? '',
      VOUCHERTYPENAME: header.match(/<VOUCHERTYPENAME>(.*?)<\/VOUCHERTYPENAME>/)?.[1] ?? '',
      PARTYLEDGERNAME: header.match(/<PARTYLEDGERNAME>(.*?)<\/PARTYLEDGERNAME>/)?.[1] ?? '',
      DATE: header.match(/<DATE>(.*?)<\/DATE>/)?.[1] ?? '',
      AMOUNT: header.match(/<AMOUNT>(.*?)<\/AMOUNT>/)?.[1] ?? '0',
      NARRATION: header.match(/<NARRATION>(.*?)<\/NARRATION>/)?.[1] ?? '',
      ALLLEDGERENTRIES: entries,
    })
  }
  return blocks
}

function toTallyBill(v: TallyVoucherBlock): TallyBill {
  return {
    GUID: v.GUID,
    MASTERID: v.MASTERID,
    VOUCHERNUMBER: v.VOUCHERNUMBER,
    PARTYLEDGERNAME: v.PARTYLEDGERNAME,
    DATE: v.DATE,
    AMOUNT: v.AMOUNT,
    NARRATION: v.NARRATION,
  }
}

function toTallyJournal(v: TallyVoucherBlock): TallyJournal {
  return {
    GUID: v.GUID,
    MASTERID: v.MASTERID,
    VOUCHERNUMBER: v.VOUCHERNUMBER,
    DATE: v.DATE,
    NARRATION: v.NARRATION,
    ALLLEDGERENTRIES: v.ALLLEDGERENTRIES,
  }
}

// Receipt, Payment and Contra vouchers all represent cash/bank movement, so
// they map to the generic `transaction` resource. Payment could in principle
// also fit `expense` — but this adapter implements neither listExpenses nor
// getExpense, so there is no split to reconcile: Payment vouchers surface
// only through listTransactions/getTransaction.
const TRANSACTION_VOUCHER_TYPES = ['Receipt', 'Payment', 'Contra']
const TRANSACTION_VOUCHER_TYPE_FILTER = TRANSACTION_VOUCHER_TYPES.map((t) => `$VoucherTypeName = "${t}"`).join(' OR ')

function toTallyTransaction(v: TallyVoucherBlock): TallyTransaction {
  return {
    GUID: v.GUID,
    MASTERID: v.MASTERID,
    VOUCHERNUMBER: v.VOUCHERNUMBER,
    VOUCHERTYPENAME: v.VOUCHERTYPENAME,
    PARTYLEDGERNAME: v.PARTYLEDGERNAME,
    DATE: v.DATE,
    AMOUNT: v.AMOUNT,
    NARRATION: v.NARRATION,
  }
}


export class TallyPrimeAdapter implements AccountingAdapter {

  // Connect Link support — per-customer form (see ./auth.ts).

  credentialFields = CREDENTIAL_FORM.credentialFields

  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  readonly platform = 'tallyprime'
  readonly version = '0.1.0'

  private host: string
  private port: number

  constructor(config: TallyAdapterConfig = {}) {
    this.host = config.host ?? ''
    this.port = config.port ?? TALLY_DEFAULT_PORT
  }

  getAuthUrl(state: string): string {
    return buildAuthUrl('', '', [], state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  /**
   * The gateway is per customer: `extra.baseUrl`, set by the Connect Link form.
   * An explicitly configured deployment host is the only fallback — there is
   * deliberately no localhost default.
   */
  private client(credentials: Credentials): TallyClient {
    const stored = credentials.extra?.['baseUrl']
    if (typeof stored === 'string' && stored) return new TallyClient(stored)
    if (this.host) return new TallyClient(`http://${this.host}:${this.port}`)
    throw new Error(
      'TallyPrime connection is missing its gateway URL; reconnect it and enter the HTTPS gateway address.',
    )
  }

  private async parseXmlResponse(xml: string): Promise<Record<string, unknown>> {
    // Minimal XML parser for Tally responses — extract TALLYMESSAGE content
    // In production, a proper XML library (e.g. fast-xml-parser) would be used
    const items: Record<string, unknown>[] = []
    const tagMatch = xml.match(/<TALLYMESSAGE[^>]*>([\s\S]*?)<\/TALLYMESSAGE>/g)
    if (!tagMatch) return { items }
    return { items }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const xml = await this.client(credentials).request(
      buildXml('<EXPORTDATA><REQUESTDESC><REPORTNAME>Company</REPORTNAME><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES></REQUESTDESC></EXPORTDATA>'),
    )
    const nameMatch = xml.match(/<NAME\.LIST TYPE="String"><NAME>(.*?)<\/NAME>/)
    const raw: TallyOrganization = { COMPANYNAME: nameMatch?.[1] ?? '' }
    return transformOrganization(raw)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, _params: QueryParams): Promise<Invoice[]> {
    const xml = await this.client(credentials).request(
      exportXml('Voucher Register', '<SVVOUCHERTYPE>Sales</SVVOUCHERTYPE>'),
    )
    // Parse voucher XML into TallyInvoice objects
    const vouchers: TallyInvoice[] = []
    const matches = xml.matchAll(/<VOUCHER[^>]*>([\s\S]*?)<\/VOUCHER>/g)
    for (const match of matches) {
      const block = match[1]
      const voucher: TallyInvoice = {
        VOUCHERNUMBER: block.match(/<VOUCHERNUMBER>(.*?)<\/VOUCHERNUMBER>/)?.[1] ?? '',
        PARTYLEDGERNAME: block.match(/<PARTYLEDGERNAME>(.*?)<\/PARTYLEDGERNAME>/)?.[1] ?? '',
        DATE: block.match(/<DATE>(.*?)<\/DATE>/)?.[1] ?? '',
        AMOUNT: block.match(/<AMOUNT>(.*?)<\/AMOUNT>/)?.[1] ?? '0',
        NARRATION: block.match(/<NARRATION>(.*?)<\/NARRATION>/)?.[1] ?? '',
      }
      vouchers.push(voucher)
    }
    return vouchers.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const xml = await this.client(credentials).request(
      buildXml(`<EXPORTDATA><REQUESTDESC><REPORTNAME>Voucher Register</REPORTNAME><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><VOUCHERNUMBER>${id}</VOUCHERNUMBER></STATICVARIABLES></REQUESTDESC></EXPORTDATA>`),
    )
    const block = xml.match(/<VOUCHER[^>]*>([\s\S]*?)<\/VOUCHER>/)?.[1] ?? ''
    const voucher: TallyInvoice = {
      VOUCHERNUMBER: block.match(/<VOUCHERNUMBER>(.*?)<\/VOUCHERNUMBER>/)?.[1] ?? id,
      PARTYLEDGERNAME: block.match(/<PARTYLEDGERNAME>(.*?)<\/PARTYLEDGERNAME>/)?.[1] ?? '',
      DATE: block.match(/<DATE>(.*?)<\/DATE>/)?.[1] ?? '',
      AMOUNT: block.match(/<AMOUNT>(.*?)<\/AMOUNT>/)?.[1] ?? '0',
      NARRATION: block.match(/<NARRATION>(.*?)<\/NARRATION>/)?.[1] ?? '',
    }
    return transformInvoice(voucher)
  }

  // --- Bills (Purchase vouchers) ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const xml = await this.client(credentials).request(
      voucherCollectionXml('$VoucherTypeName = "Purchase"', params),
    )
    return parseVoucherBlocks(xml).map(toTallyBill).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const xml = await this.client(credentials).request(
      voucherCollectionXml('$VoucherTypeName = "Purchase"', {}, voucherIdFilter(id)),
    )
    const [voucher] = parseVoucherBlocks(xml)
    if (!voucher) {
      throw Object.assign(new Error(`TallyPrime: bill ${id} not found`), { statusCode: 404 })
    }
    return transformBill(toTallyBill(voucher))
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const xml = await this.client(credentials).request(
      voucherCollectionXml('$VoucherTypeName = "Journal"', params),
    )
    return parseVoucherBlocks(xml).map(toTallyJournal).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const xml = await this.client(credentials).request(
      voucherCollectionXml('$VoucherTypeName = "Journal"', {}, voucherIdFilter(id)),
    )
    const [voucher] = parseVoucherBlocks(xml)
    if (!voucher) {
      throw Object.assign(new Error(`TallyPrime: journal ${id} not found`), { statusCode: 404 })
    }
    return transformJournal(toTallyJournal(voucher))
  }

  // --- Transactions (Receipt, Payment, Contra vouchers) ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const xml = await this.client(credentials).request(
      voucherCollectionXml(TRANSACTION_VOUCHER_TYPE_FILTER, params),
    )
    return parseVoucherBlocks(xml).map(toTallyTransaction).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const xml = await this.client(credentials).request(
      voucherCollectionXml(TRANSACTION_VOUCHER_TYPE_FILTER, {}, voucherIdFilter(id)),
    )
    const [voucher] = parseVoucherBlocks(xml)
    if (!voucher) {
      throw Object.assign(new Error(`TallyPrime: transaction ${id} not found`), { statusCode: 404 })
    }
    return transformTransaction(toTallyTransaction(voucher))
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, _params: QueryParams): Promise<Contact[]> {
    const xml = await this.client(credentials).request(
      buildXml('<EXPORTDATA><REQUESTDESC><REPORTNAME>Ledger</REPORTNAME><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><SVCURRENTCOMPANY>$$CurrentCompany</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC></EXPORTDATA>'),
    )
    const ledgers: TallyLedger[] = []
    const matches = xml.matchAll(/<LEDGER\s+NAME="([^"]+)"[^>]*>([\s\S]*?)<\/LEDGER>/g)
    for (const match of matches) {
      ledgers.push({ NAME: match[1], PARENT: match[2].match(/<PARENT>(.*?)<\/PARENT>/)?.[1] ?? '', OPENINGBALANCE: '', COUNTRYNAME: '' })
    }
    return ledgers.map(transformContact)
  }

  async getContact(_credentials: Credentials, id: string): Promise<Contact> {
    const raw: TallyLedger = { NAME: id, PARENT: '', OPENINGBALANCE: '', COUNTRYNAME: '' }
    return transformContact(raw)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, _params: QueryParams): Promise<Account[]> {
    const xml = await this.client(credentials).request(
      buildXml('<EXPORTDATA><REQUESTDESC><REPORTNAME>Ledger</REPORTNAME><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES></REQUESTDESC></EXPORTDATA>'),
    )
    const ledgers = []
    const matches = xml.matchAll(/<LEDGER\s+NAME="([^"]+)"[^>]*>([\s\S]*?)<\/LEDGER>/g)
    for (const match of matches) {
      ledgers.push({
        NAME: match[1],
        PARENT: match[2].match(/<PARENT>(.*?)<\/PARENT>/)?.[1] ?? '',
        OPENINGBALANCE: match[2].match(/<OPENINGBALANCE>(.*?)<\/OPENINGBALANCE>/)?.[1] ?? '0',
        CLOSINGBALANCE: match[2].match(/<CLOSINGBALANCE>(.*?)<\/CLOSINGBALANCE>/)?.[1] ?? '0',
      })
    }
    return ledgers.map(transformAccount)
  }

  async getAccount(_credentials: Credentials, id: string): Promise<Account> {
    return transformAccount({ NAME: id, PARENT: '', OPENINGBALANCE: '0', CLOSINGBALANCE: '0' })
  }
}
