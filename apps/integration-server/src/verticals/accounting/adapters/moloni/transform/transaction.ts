import type { Transaction } from '../../../schema/transaction'
import { toMinorUnits } from '../../shared/transform'

export interface MoloniTransaction {
  payment_method_id: number
  name: string
  value: number
  [key: string]: unknown
}

export function transformTransaction(raw: MoloniTransaction): Transaction {
  return {
    id: String(raw.payment_method_id),
    memo: raw.name || undefined,
    totalAmount: toMinorUnits(raw.value),
    metadata: raw as Record<string, unknown>,
  }
}
