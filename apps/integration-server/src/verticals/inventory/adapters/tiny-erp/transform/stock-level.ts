/**
 * Transform a raw Olist Tiny ERP v3 stock response into canonical StockLevel records.
 *
 * Tiny API v3 GET /estoque/{idProduto} response fields:
 *   id, nome, codigo, unidade, saldo, reservado, disponivel, localizacao,
 *   depositos[]{id, nome, desconsiderar, saldo, reservado, disponivel, empresa}
 *
 * One StockLevel record is emitted per deposito entry. If no depositos are
 * returned, a single aggregate record is emitted using the top-level saldo.
 */
import type { StockLevel } from '../../../schema/stock-level'
import {strMap} from './shared'

export interface RawTinyErpStockDeposito {
  id?: number | string
  nome?: string
  desconsiderar?: boolean
  saldo?: number
  reservado?: number
  disponivel?: number
  empresa?: string
  [key: string]: unknown
}

export interface RawTinyErpStockLevel {
  id: number | string
  nome?: string
  codigo?: string
  unidade?: string
  saldo?: number
  reservado?: number
  disponivel?: number
  localizacao?: string
  depositos?: RawTinyErpStockDeposito[]
  [key: string]: unknown
}

export function transformStockLevels(raw: RawTinyErpStockLevel): StockLevel[] {
  const productId = String(raw.id)
  const depositos = raw.depositos ?? []

  if (depositos.length === 0) {
    // Aggregate record — no warehouse breakdown
    return [
      {
        id: `${productId}:aggregate`,
        productId,
        locationId: '',
        quantityOnHand: raw.saldo ?? 0,
        quantityAvailable: raw.disponivel,
        quantityCommitted: raw.reservado,
        platform: 'tiny-erp',
        metadata: strMap({ localizacao: raw.localizacao }),
        raw,
      },
    ]
  }

  return depositos.map((dep): StockLevel => {
    const locationId = dep.id != null ? String(dep.id) : dep.nome ?? ''
    return {
      id: `${productId}:${locationId}`,
      productId,
      locationId,
      quantityOnHand: dep.saldo ?? 0,
      quantityAvailable: dep.disponivel,
      quantityCommitted: dep.reservado,
      platform: 'tiny-erp',
      metadata: strMap({
        depositoNome: dep.nome,
        desconsiderar: dep.desconsiderar,
        empresa: dep.empresa,
      }),
      raw: dep,
    }
  })
}

/**
 * Flat variant used by the adapter's listStockLevels / getStockLevel API.
 * Wraps the multi-record transformStockLevels result into a single
 * aggregate-level view (first deposito, or aggregate) so callers receive
 * a single StockLevel for a given product+location lookup.
 */
export function transformStockLevel(raw: RawTinyErpStockLevel): StockLevel {
  return transformStockLevels(raw)[0]!
}
