/**
 * Transform a raw Olist Tiny ERP v3 contact (fornecedor) into the canonical Supplier schema.
 *
 * Tiny v3 contacts API GET /contatos returns all contact types. Contacts that
 * represent suppliers carry a `tipos` array with a descriptor matching
 * "Fornecedor". The adapter filters by this at the index level.
 *
 * Fields: id, nome, codigo, fantasia, tipoPessoa (J|F|E|X), cpfCnpj,
 *   telefone, celular, email, situacao (B|A|I|E), dataCriacao, dataAtualizacao,
 *   tipos[]{id, descricao}, endereco{endereco, numero, complemento, bairro,
 *   municipio, cep, uf, pais}
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, strMap} from './shared'

export interface RawTinyErpContato {
  id: number | string
  nome?: string
  codigo?: string
  fantasia?: string
  tipoPessoa?: string
  cpfCnpj?: string
  telefone?: string
  celular?: string
  email?: string
  situacao?: string
  dataCriacao?: string
  dataAtualizacao?: string
  tipos?: Array<{ id?: number | string; descricao?: string }>
  endereco?: {
    endereco?: string
    numero?: string
    complemento?: string
    bairro?: string
    municipio?: string
    cep?: string
    uf?: string
    pais?: string
  }
  [key: string]: unknown
}

export function transformSupplier(raw: RawTinyErpContato): Supplier {
  const end = raw.endereco
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.nome) ?? '',
    email: pickStr(raw.email),
    phone: pickStr(raw.telefone ?? raw.celular),
    defaultCurrency: 'BRL',
    isActive:
      raw.situacao === 'A' || raw.situacao === 'B'
        ? true
        : raw.situacao === 'I' || raw.situacao === 'E'
          ? false
          : true,
    platform: 'tiny-erp',
    metadata: strMap({
      codigo: raw.codigo,
      fantasia: raw.fantasia,
      tipoPessoa: raw.tipoPessoa,
      cpfCnpj: raw.cpfCnpj,
      situacao: raw.situacao,
      // address fields stored in metadata (Supplier schema has no address field)
      endereco: end?.endereco,
      enderecoNumero: end?.numero,
      enderecoComplemento: end?.complemento,
      bairro: end?.bairro,
      municipio: end?.municipio,
      cep: end?.cep,
      uf: end?.uf,
      pais: end?.pais,
    }),
    raw,
  }
}
