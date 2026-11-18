import type { Transaction, TransactionContact } from '../../../schema/transaction'

export interface QBOPaymentLine {
  Amount: number
  LinkedTxn?: Array<{ TxnId: string; TxnType: string }>
}

export interface QBOPayment {
  Id: string
  TxnDate: string
  CustomerRef?: { value: string }
  TotalAmt: number
  UnappliedAmt: number
  CurrencyRef?: { value: string }
  PaymentMethodRef?: { value: string }
  DepositToAccountRef?: { value: string }
  Line?: QBOPaymentLine[]
  [key: string]: unknown
}

export function transformTransaction(raw: QBOPayment): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.CustomerRef?.value) {
    contacts.push({ id: raw.CustomerRef.value })
  }

  return {
    id: raw.Id,
    accountId: raw.DepositToAccountRef?.value || undefined,
    currency: raw.CurrencyRef?.value || undefined,
    paymentMethod: raw.PaymentMethodRef?.value || undefined,
    totalAmount: raw.TotalAmt,
    contacts: contacts.length > 0 ? contacts : undefined,
    createdAt: raw.TxnDate ? new Date(raw.TxnDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
