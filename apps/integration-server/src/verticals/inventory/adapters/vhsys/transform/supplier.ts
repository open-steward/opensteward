import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickNum, strMap} from './shared'

/**
 * Raw supplier record returned by GET /v2/fornecedores or GET /v2/fornecedores/:id.
 * In VHSYS, suppliers share the contacts table with clients (tipo_pessoa distinguishes them).
 */
export interface RawVhsysSupplier {
  id_fornecedor: string | number
  razao_fornecedor?: string
  fantasia_fornecedor?: string
  email_fornecedor?: string
  fone_fornecedor?: string
  celular_fornecedor?: string
  prazo_entrega_fornecedor?: number | string
  moeda_fornecedor?: string
  situacao_fornecedor?: string
  ativo_fornecedor?: string | number | boolean
  [key: string]: unknown
}

export function transformSupplier(raw: RawVhsysSupplier): Supplier {
  const id = String(raw.id_fornecedor)
  const name = pickStr(raw.fantasia_fornecedor) ?? pickStr(raw.razao_fornecedor) ?? ''
  const phone = pickStr(raw.fone_fornecedor) ?? pickStr(raw.celular_fornecedor)
  const situacao = (raw.situacao_fornecedor ?? raw.ativo_fornecedor ?? '').toString().toLowerCase()
  const isActive = situacao !== 'inativo' && situacao !== '0' && situacao !== 'false'

  return {
    id,
    externalId: id,
    name,
    email: pickStr(raw.email_fornecedor),
    phone,
    defaultCurrency: pickStr(raw.moeda_fornecedor) ?? 'BRL',
    defaultLeadTimeDays: pickNum(raw.prazo_entrega_fornecedor),
    isActive,
    platform: 'vhsys',
    metadata: strMap({ razaoSocial: raw.razao_fornecedor, situacao: raw.situacao_fornecedor }),
    raw,
  }
}
