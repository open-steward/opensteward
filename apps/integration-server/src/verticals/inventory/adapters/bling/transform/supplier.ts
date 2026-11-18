/**
 * Bling supplier transform.
 *
 * Bling stores suppliers as contacts (contatos) filtered to the account's
 * "Fornecedor" contact type, resolved via GET /Api/v3/contatos/tipos and
 * passed as idTipoContato on GET /Api/v3/contatos (see ../index.ts). The
 * contact's own `tipo` field below is the *person* type — F=Fisica
 * (individual), J=Juridica (company), E=Estrangeira (foreign) — it does
 * not mean "supplier".
 * GET /Api/v3/contatos          — list contacts (filtered by idTipoContato)
 * GET /Api/v3/contatos/{id}     — single contact
 *
 * Key fields from IFindResponse.data:
 *   id, nome, codigo, situacao (1=active, 2=inactive),
 *   email, telefone, celular, fantasia,
 *   tipo, numeroDocumento,
 *   endereco { geral { endereco, cep, bairro, municipio, uf, numero, complemento } }
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, strMap} from './shared'

export interface RawBlingContatoEndereco {
  endereco?: string
  cep?: string
  bairro?: string
  municipio?: string
  uf?: string
  numero?: string
  complemento?: string
}

export interface RawBlingContato {
  id: number
  nome?: string
  codigo?: string
  fantasia?: string
  /** 1 = active, 2 = inactive */
  situacao?: number
  numeroDocumento?: string
  email?: string
  telefone?: string
  celular?: string
  tipo?: string
  endereco?: {
    geral?: RawBlingContatoEndereco
    cobranca?: RawBlingContatoEndereco
  }
  financeiro?: { limiteCredito?: number; condicaoPagamento?: string }
  [key: string]: unknown
}

export function transformSupplier(raw: RawBlingContato): Supplier {
  const phone = pickStr(raw.telefone) ?? pickStr(raw.celular)
  const addr = raw.endereco?.geral

  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.nome) ?? pickStr(raw.fantasia) ?? '',
    email: pickStr(raw.email),
    phone,
    defaultCurrency: 'BRL',
    defaultLeadTimeDays: undefined,
    isActive: raw.situacao !== undefined ? raw.situacao === 1 : true,
    platform: 'bling',
    metadata: strMap({
      tipo: raw.tipo,
      fantasia: raw.fantasia,
      numeroDocumento: raw.numeroDocumento,
      codigo: raw.codigo,
      situacao: raw.situacao,
      // address fields encoded in metadata (Supplier schema has no address field)
      addressEndereco: addr?.endereco,
      addressCep: addr?.cep,
      addressMunicipio: addr?.municipio,
      addressUf: addr?.uf,
      addressBairro: addr?.bairro,
      addressNumero: addr?.numero,
      addressComplemento: addr?.complemento,
    }),
    raw,
  }
}
