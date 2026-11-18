import type { Transaction, TransactionContact } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

export interface FacturamaTransactionLine {
  AccountCode: string
  Name: string
  Description: string
  Amount: number
  [key: string]: unknown
}

export interface FacturamaTransaction {
  Id: string
  AccountCode: string
  Type: string
  Reference: string
  Currency: string
  Amount: number
  Date: string
  ClientId: string
  ClientName: string
  Lines: FacturamaTransactionLine[]
  [key: string]: unknown
}

function mapLineitems(raw: FacturamaTransaction): TransactionLineitem[] {
  if (raw.Lines && raw.Lines.length > 0) {
    return raw.Lines.map((li) => ({
      accountId: li.AccountCode || undefined,
      name: li.Name || undefined,
      description: li.Description || undefined,
      totalAmount: li.Amount,
    }))
  }
  return [
    {
      accountId: raw.AccountCode || undefined,
      name: raw.Type || undefined,
      totalAmount: raw.Amount,
    },
  ]
}

export function transformTransaction(raw: FacturamaTransaction): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.ClientId) {
    contacts.push({ id: raw.ClientId, name: raw.ClientName || undefined })
  }

  return {
    id: String(raw.Id),
    accountId: raw.AccountCode || undefined,
    type: raw.Type || undefined,
    reference: raw.Reference || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.Amount,
    contacts: contacts.length > 0 ? contacts : undefined,
    lineItems: mapLineitems(raw),
    createdAt: raw.Date ? new Date(raw.Date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
