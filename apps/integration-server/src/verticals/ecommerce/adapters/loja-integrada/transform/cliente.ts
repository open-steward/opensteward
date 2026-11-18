/**
 * Loja Integrada customer (GET /v1/cliente, GET /v1/cliente/{cliente_id}) →
 * canonical Customer.
 *
 * The list answer carries `id`, `nome`, `email`, `data_criacao`,
 * `data_modificacao` (plus CPF/CNPJ fields); the single-customer answer adds
 * `aceita_newsletter`, `telefone_principal` and `enderecos` (each with
 * `endereco`, `numero`, `complemento`, `bairro`, `cidade`, `estado`, `cep`,
 * `pais`, `nome`, `principal`).
 *
 * `nome` is one full-name field; it is split at its first space into
 * `firstName` and `lastName`. `pais` is a country NAME ("Brasil"), not the
 * ISO code the canonical address wants, so it is not mapped.
 */
import { z } from 'zod'
import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { requireId, text, zonedIso } from '../util'

export interface RawLojaIntegradaEndereco {
  id?: number
  nome?: string | null
  endereco?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  cidade?: string | null
  estado?: string | null
  cep?: string | null
  pais?: string | null
  principal?: boolean
}

export interface RawLojaIntegradaCliente {
  id: number
  nome?: string | null
  email?: string | null
  aceita_newsletter?: boolean
  telefone_principal?: string | null
  enderecos?: RawLojaIntegradaEndereco[]
  data_criacao?: string | null
  data_modificacao?: string | null
  [key: string]: unknown
}

export function toAddress(raw: RawLojaIntegradaEndereco): Address {
  const street = text(raw.endereco)
  const number = text(raw.numero)
  const out: Address = {}
  if (street) out.line1 = number ? `${street}, ${number}` : street
  const complement = text(raw.complemento)
  if (complement) out.line2 = complement
  const city = text(raw.cidade)
  if (city) out.city = city
  const state = text(raw.estado)
  if (state) out.region = state
  const cep = text(raw.cep)
  if (cep) out.postalCode = cep
  return out
}

export function splitName(nome: unknown): { firstName?: string; lastName?: string } {
  const full = text(nome)?.trim()
  if (!full) return {}
  const at = full.search(/\s/)
  if (at < 0) return { firstName: full }
  const lastName = full.slice(at).trim()
  return { firstName: full.slice(0, at), ...(lastName ? { lastName } : {}) }
}

export function transformCliente(raw: RawLojaIntegradaCliente): Customer {
  const email = z.email().safeParse(raw.email)
  const phone = text(raw.telefone_principal)
  const addresses = (raw.enderecos ?? []).map(toAddress)
  const principal = (raw.enderecos ?? []).findIndex((e) => e.principal === true)
  const createdAt = zonedIso(raw.data_criacao)
  const updatedAt = zonedIso(raw.data_modificacao)
  return {
    id: requireId(raw.id, 'customer'),
    ...(email.success ? { email: email.data } : {}),
    ...splitName(raw.nome),
    ...(phone ? { phone } : {}),
    ...(typeof raw.aceita_newsletter === 'boolean'
      ? { acceptsMarketing: raw.aceita_newsletter }
      : {}),
    ...(principal >= 0 ? { defaultAddress: addresses[principal] } : {}),
    ...(addresses.length > 0 ? { addresses } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    metadata: { ...raw },
  }
}
