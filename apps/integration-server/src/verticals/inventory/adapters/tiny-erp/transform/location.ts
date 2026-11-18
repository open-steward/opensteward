/**
 * Transform a raw Olist Tiny ERP v3 deposito into the canonical Location schema.
 *
 * Tiny API v3 GET /depositos (list) and GET /depositos/{id} (single).
 * Fields documented in v3.1.2 release: id, nome, descricao, ativo, empresa.
 * The full schema is returned by GET /depositos/{id}.
 */
import type { Location } from '../../../schema/location'
import {pickStr, pickBool, strMap} from './shared'

export interface RawTinyErpDeposito {
  id: number | string
  nome?: string
  descricao?: string
  ativo?: boolean | string | number
  empresa?: string
  [key: string]: unknown
}

export function transformLocation(raw: RawTinyErpDeposito): Location {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.nome) ?? '',
    type: 'warehouse',
    isActive: pickBool(raw.ativo) ?? true,
    platform: 'tiny-erp',
    metadata: strMap({ descricao: raw.descricao, empresa: raw.empresa }),
    raw,
  }
}
