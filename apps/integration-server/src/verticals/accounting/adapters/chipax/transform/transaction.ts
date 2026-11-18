import type { Transaction, TransactionContact } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

export interface ChipaxTransactionLine {
  cuentaId: string
  nombre: string
  descripcion: string
  monto: number
  [key: string]: unknown
}

export interface ChipaxTransaction {
  id: number
  cuentaId: string
  tipo: string
  referencia: string
  moneda: string
  monto: number
  fechaPago: string
  contactoId: number
  contactoNombre: string
  lineas: ChipaxTransactionLine[]
  [key: string]: unknown
}

function mapLineitems(raw: ChipaxTransaction): TransactionLineitem[] {
  if (raw.lineas && raw.lineas.length > 0) {
    return raw.lineas.map((li) => ({
      accountId: li.cuentaId || undefined,
      name: li.nombre || undefined,
      description: li.descripcion || undefined,
      totalAmount: li.monto,
    }))
  }
  return [
    {
      accountId: raw.cuentaId || undefined,
      name: raw.tipo || undefined,
      totalAmount: raw.monto,
    },
  ]
}

export function transformTransaction(raw: ChipaxTransaction): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.contactoId) {
    contacts.push({ id: String(raw.contactoId), name: raw.contactoNombre || undefined })
  }

  return {
    id: String(raw.id),
    accountId: raw.cuentaId || undefined,
    type: raw.tipo || undefined,
    reference: raw.referencia || undefined,
    currency: raw.moneda || undefined,
    totalAmount: raw.monto,
    contacts: contacts.length > 0 ? contacts : undefined,
    lineItems: mapLineitems(raw),
    createdAt: raw.fechaPago ? new Date(raw.fechaPago) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
