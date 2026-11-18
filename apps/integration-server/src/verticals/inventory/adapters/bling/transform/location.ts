/**
 * Bling deposit (warehouse) transform.
 *
 * GET /Api/v3/depositos       — list (data: RawBlingDeposito[])
 * GET /Api/v3/depositos/{id}  — single (data: RawBlingDeposito)
 *
 * Bling calls warehouses "depósitos" (deposits).
 * Fields: id, descricao, situacao, padrao, desconsiderarSaldo
 *   situacao: 1 = active, 2 = inactive
 *   padrao: true if this is the default/main warehouse
 */
import type { Location } from '../../../schema/location'
import {pickStr, strMap} from './shared'

export interface RawBlingDeposito {
  id: number
  descricao?: string
  /** 1 = active, 2 = inactive */
  situacao?: number
  padrao?: boolean
  desconsiderarSaldo?: boolean
  [key: string]: unknown
}

export function transformLocation(raw: RawBlingDeposito): Location {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.descricao) ?? '',
    code: undefined,
    type: 'warehouse',
    parentLocationId: undefined,
    address: undefined,
    isActive: raw.situacao !== undefined ? raw.situacao === 1 : true,
    platform: 'bling',
    metadata: strMap({
      padrao: raw.padrao,
      desconsiderarSaldo: raw.desconsiderarSaldo,
      situacao: raw.situacao,
    }),
    raw,
  }
}
