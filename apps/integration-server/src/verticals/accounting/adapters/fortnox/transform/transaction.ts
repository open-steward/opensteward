import type { Transaction, TransactionContact } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'
import { toMinorUnits } from '../../shared/transform'

export interface FortnoxWriteOff {
  WriteOffAmount: number
  AccountNumber: string
  Description: string
}

export interface FortnoxPayment {
  Number: string
  InvoiceNumber: string
  Amount: number
  AmountCurrency: number
  Currency: string
  PaymentDate: string
  Source: string
  AccountNumber: string
  WriteOffs: FortnoxWriteOff[]
  CustomerNumber: string
  CustomerName: string
  [key: string]: unknown
}

function mapLineitems(raw: FortnoxPayment): TransactionLineitem[] {
  const items: TransactionLineitem[] = [
    {
      accountId: raw.AccountNumber || undefined,
      name: raw.Source || undefined,
      totalAmount: toMinorUnits(raw.Amount),
    },
  ]
  for (const wo of raw.WriteOffs ?? []) {
    items.push({
      accountId: wo.AccountNumber || undefined,
      description: wo.Description || undefined,
      totalAmount: toMinorUnits(wo.WriteOffAmount),
    })
  }
  return items
}

export function transformTransaction(raw: FortnoxPayment): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.CustomerNumber) {
    contacts.push({ id: raw.CustomerNumber, name: raw.CustomerName || undefined })
  }

  return {
    id: raw.Number,
    accountId: raw.AccountNumber || undefined,
    type: raw.Source || undefined,
    reference: raw.InvoiceNumber || undefined,
    currency: raw.Currency || undefined,
    totalAmount: toMinorUnits(raw.Amount),
    contacts: contacts.length > 0 ? contacts : undefined,
    lineItems: mapLineitems(raw),
    createdAt: raw.PaymentDate ? new Date(raw.PaymentDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
