/**
 * Pagar.me `Customer` — first-class resource at `/customers`. `created_at` /
 * `updated_at` are ISO-8601 strings. A customer carries a tax `document`
 * (CPF/CNPJ) and an array of `phones` (home/mobile), neither of which the
 * canonical schema models — they are folded into `metadata` so nothing is
 * lost. The single-line `phone` we surface is the mobile number when present,
 * else the home number.
 *
 * Refs:
 *   https://docs.pagar.me/reference/criar-cliente-1
 *   https://docs.pagar.me/reference/obter-cliente-1
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Customer } from '../../../schema/customer'
import { strMap } from './shared'

export interface RawPagarmePhone {
  country_code?: string
  area_code?: string
  number?: string
  [k: string]: unknown
}

export interface RawPagarmePhones {
  home_phone?: RawPagarmePhone
  mobile_phone?: RawPagarmePhone
  [k: string]: unknown
}

export interface RawPagarmeCustomer {
  id?: string
  name?: string
  email?: string
  code?: string
  document?: string
  document_type?: string
  type?: string
  gender?: string
  delinquent?: boolean
  birthdate?: string
  phones?: RawPagarmePhones
  metadata?: Record<string, unknown>
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function formatPhone(p: RawPagarmePhone | undefined): string | undefined {
  if (!p) return undefined
  const parts = [p.country_code, p.area_code, p.number].filter(Boolean)
  const joined = parts.join('')
  return joined ? (p.country_code ? `+${joined}` : joined) : undefined
}

export function transformCustomer(raw: RawPagarmeCustomer): Customer {
  const phone = formatPhone(raw.phones?.mobile_phone) ?? formatPhone(raw.phones?.home_phone)
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.code ?? raw.id ?? ''),
    email: raw.email ?? undefined,
    name: raw.name ?? undefined,
    phone,
    delinquent: typeof raw.delinquent === 'boolean' ? raw.delinquent : undefined,
    gateway: 'pagarme',
    metadata: strMap({
      ...raw.metadata,
      document: raw.document,
      document_type: raw.document_type,
      type: raw.type,
      gender: raw.gender,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
