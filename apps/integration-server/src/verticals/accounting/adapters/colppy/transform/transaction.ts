import type { Transaction, TransactionContact } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

export interface ColppyMovimiento {
  idMovimiento: number
  idCuenta: number
  tipo: string
  referencia: string
  moneda: string
  monto: number
  fecha: string
  idCliente: number
  nombreCliente: string
  detalles: ColppyMovimientoDetalle[]
  [key: string]: unknown
}

export interface ColppyMovimientoDetalle {
  idCuenta: number
  nombre: string
  descripcion: string
  monto: number
  [key: string]: unknown
}

function mapLineitems(raw: ColppyMovimiento): TransactionLineitem[] {
  const items: TransactionLineitem[] = [
    {
      accountId: raw.idCuenta ? String(raw.idCuenta) : undefined,
      name: raw.tipo || undefined,
      totalAmount: raw.monto,
    },
  ]
  for (const det of raw.detalles ?? []) {
    items.push({
      accountId: det.idCuenta ? String(det.idCuenta) : undefined,
      name: det.nombre || undefined,
      description: det.descripcion || undefined,
      totalAmount: det.monto,
    })
  }
  return items
}

export function transformTransaction(raw: ColppyMovimiento): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.idCliente) {
    contacts.push({ id: String(raw.idCliente), name: raw.nombreCliente || undefined })
  }

  return {
    id: String(raw.idMovimiento),
    accountId: raw.idCuenta ? String(raw.idCuenta) : undefined,
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
