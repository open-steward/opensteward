/**
 * MarketMan vendor → canonical Supplier.
 *
 * POST https://api.marketman.com/v3/buyers/items/GetVendors ("Gets all vendors
 * your account is connected to"), response key `Vendors`. Its output table
 * documents each vendor as Name, Guid ("Vendor guid"), TaxLevelID,
 * CreditAccountName, ExpenseAccount ("Debit account name in Marketman"),
 * IncomeAccountName and EnabledForOrders; the saved example response carries
 * `DebitAccountName` where the table says `ExpenseAccount`. Both are kept in
 * metadata under their own names. No contact, currency or lead-time field is
 * documented, so those stay unset.
 *
 * Docs: https://api-doc.marketman.com/api/collections/10610779/T1LPET6f?segregateAuth=true&versionTag=latest
 */
import type { Supplier } from '../../../schema/supplier'
import { pickStr, strMap } from './shared'

export interface RawMarketmanSupplier {
  Name?: string | null
  Guid?: string | null
  TaxLevelID?: number | null
  CreditAccountName?: string | null
  ExpenseAccount?: string | null
  DebitAccountName?: string | null
  IncomeAccountName?: string | null
  EnabledForOrders?: boolean | null
  [key: string]: unknown
}

export function transformSupplier(raw: RawMarketmanSupplier): Supplier {
  const id = pickStr(raw.Guid)
  if (!id) throw new Error('marketman vendor has no Guid ("Vendor guid")')
  const name = pickStr(raw.Name)
  if (name === undefined) throw new Error(`marketman vendor ${id} has no Name`)
  return {
    id,
    externalId: id,
    name,
    email: undefined,
    phone: undefined,
    defaultCurrency: undefined,
    defaultLeadTimeDays: undefined,
    // GetVendors returns only the vendors "your account is connected to".
    isActive: true,
    platform: 'marketman',
    metadata: strMap({
      TaxLevelID: raw.TaxLevelID,
      CreditAccountName: raw.CreditAccountName,
      ExpenseAccount: raw.ExpenseAccount,
      DebitAccountName: raw.DebitAccountName,
      IncomeAccountName: raw.IncomeAccountName,
      EnabledForOrders: raw.EnabledForOrders,
    }),
    raw,
  }
}
