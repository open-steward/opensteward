import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

/**
 * Raw deposit/location record returned by GET /v2/depositos or GET /v2/depositos/:id.
 * VHSYS calls stock locations "depósitos" (deposits).
 */
export interface RawVhsysLocation {
  id_deposito: string | number
  nome_deposito?: string
  sigla_deposito?: string
  padrao_deposito?: string | number | boolean
  ativo_deposito?: string | number | boolean
  endereco_deposito?: string
  cidade_deposito?: string
  estado_deposito?: string
  cep_deposito?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawVhsysLocation): Location {
  const id = String(raw.id_deposito)

  return {
    id,
    externalId: id,
    name: pickStr(raw.nome_deposito) ?? '',
    code: pickStr(raw.sigla_deposito),
    type: 'warehouse',
    parentLocationId: undefined,
    address: raw.endereco_deposito || raw.cidade_deposito || raw.estado_deposito
      ? {
          line1: pickStr(raw.endereco_deposito),
          city: pickStr(raw.cidade_deposito),
          region: pickStr(raw.estado_deposito),
          country: 'BR',
          postalCode: pickStr(raw.cep_deposito),
        }
      : undefined,
    isActive: pickBool(raw.ativo_deposito) ?? true,
    platform: 'vhsys',
    metadata: strMap({ isDefault: raw.padrao_deposito }),
    raw,
  }
}
