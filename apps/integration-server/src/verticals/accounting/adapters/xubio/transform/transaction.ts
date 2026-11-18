import type { Transaction, TransactionContact } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

export interface XubioTransaction {
  id: number
  fecha: string
  monto: number
  moneda: string
  tipo: string
  cuentaId: number
  referencia: string
  contactoId: number
  contactoNombre: string
  descripcion: string
  [key: string]: unknown
}

function mapLineitems(raw: XubioTransaction): TransactionLineitem[] {
  return [
    {
      accountId: raw.cuentaId ? String(raw.cuentaId) : undefined,
      name: raw.descripcion || undefined,
      totalAmount: raw.monto,
    },
  ]
}

export function transformTransaction(raw: XubioTransaction): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.contactoId) {
    contacts.push({ id: String(raw.contactoId), name: raw.contactoNombre || undefined })
  }

  return {
    id: String(raw.id),
    accountId: raw.cuentaId ? String(raw.cuentaId) : undefined,
    type: raw.tipo || undefined,
    reference: raw.referencia || undefined,
    currency: raw.moneda || undefined,
    totalAmount: raw.monto,
    contacts: contacts.length > 0 ? contacts : undefined,
    lineItems: mapLineitems(raw),
    createdAt: raw.fecha ? new Date(raw.fecha) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
