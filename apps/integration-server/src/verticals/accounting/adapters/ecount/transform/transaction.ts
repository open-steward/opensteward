import type { Transaction } from '../../../schema/transaction'
import type { TransactionContact } from '../../../schema/transaction'

export interface EcountTransaction {
  SLIP_NO: string
  SLIP_DATE?: string
  ACCOUNT_CODE?: string
  ACCOUNT_NAME?: string
  DR_AMT?: number
  CR_AMT?: number
  BALANCE?: number
  REMARK?: string
  CUST_CODE?: string
  [key: string]: unknown
}

export function transformTransaction(raw: EcountTransaction): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.CUST_CODE) {
    contacts.push({ id: raw.CUST_CODE })
  }

  // Use credit amount as positive, debit as positive (net amount)
  const totalAmount = (raw.CR_AMT ?? 0) > 0 ? raw.CR_AMT! : (raw.DR_AMT ?? 0)

  return {
    id: raw.SLIP_NO,
    accountId: raw.ACCOUNT_CODE || undefined,
    reference: raw.SLIP_NO,
    memo: raw.REMARK || undefined,
    totalAmount,
    contacts: contacts.length > 0 ? contacts : undefined,
    createdAt: raw.SLIP_DATE ? new Date(raw.SLIP_DATE) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
