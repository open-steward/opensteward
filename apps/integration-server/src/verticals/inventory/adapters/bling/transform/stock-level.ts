/**
 * Bling stock-level transform.
 *
 * Bling provides stock balances via:
 *   GET /Api/v3/estoques/saldos        — balances for all products
 *   GET /Api/v3/estoques/saldos/{idDeposito} — balances in a specific deposit
 *
 * Response envelope: { data: RawBlingStockBalance[] }
 * Each balance object has per-deposit breakdown in `depositos[]`.
 *
 * We flatten to one StockLevel record per product×deposit pair.
 */
import type { StockLevel } from '../../../schema/stock-level'
import {strMap} from './shared'

export interface RawBlingStockDeposito {
  id: number
  saldoFisico?: number
  saldoVirtual?: number
}

export interface RawBlingStockBalance {
  produto: { id: number }
  saldoFisicoTotal?: number
  saldoVirtualTotal?: number
  depositos?: RawBlingStockDeposito[]
  [key: string]: unknown
}

/**
 * Flatten a single balance record into one StockLevel per deposit.
 * If no deposits are present, emit one aggregate record.
 */
export function transformStockLevels(raw: RawBlingStockBalance): StockLevel[] {
  const productId = String(raw.produto.id)
  const depositos = raw.depositos ?? []

  if (depositos.length === 0) {
    return [{
      id: `${productId}:all`,
      productId,
      locationId: '',
      quantityOnHand: raw.saldoFisicoTotal ?? 0,
      quantityAvailable: raw.saldoVirtualTotal,
      platform: 'bling',
      metadata: strMap({}),
      raw,
    }]
  }

  return depositos.map((dep) => ({
    id: `${productId}:${dep.id}`,
    productId,
    locationId: String(dep.id),
    quantityOnHand: dep.saldoFisico ?? 0,
    quantityAvailable: dep.saldoVirtual,
    platform: 'bling',
    metadata: strMap({}),
    raw: dep as unknown as Record<string, unknown>,
  }))
}
