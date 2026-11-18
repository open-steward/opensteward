import type { Warehouse } from '../../../schema/warehouse'
import type { Address } from '../../../schema/shared'

/**
 * One PUDO (pickup/drop-off point) from
 * `GET https://www.jadlog.com.br/pickup/address/pudos?tipos=LOCKER,PUBLICO,JADLOG`.
 *
 * Source: Jadlog "Documento de Integração" v2.3 (Agosto-2025), "Consulta Pickup
 * Points Diário", pp. 24-28: https://www.jadlog.com.br/jadlog/arquivos/api_integracao.pdf
 * Field meanings are from its "Descrição dos Campos" table (p. 27), for example
 * `ativo` "S ou N", `dt` "Data do cadastro", `pudoEnderecoList/0/pais` "ISO 3
 * Dígitos, ex: BRA", `pudoId` "Código único de identificação, ex: BR10598",
 * `razao` "Razão social da loja".
 */
export interface JadlogPudoEndereco {
  bairro?: string | null
  cep?: string | null
  cidade?: string | null
  compl2?: string | null
  endereco?: string | null
  idioma?: string | null
  latitude?: number | null
  longitude?: number | null
  numero?: string | null
  pais?: string | null
  uf?: string | null
}

export interface JadlogPudo {
  acessoDeficienteFisico?: number | null
  ativo?: string | null
  cnpjCpf?: string | null
  dt?: string | null
  estacionamento?: number | null
  idioma?: string | null
  infCompl?: string | null
  maxEncomendaDia?: number | null
  pudoEnderecoList?: JadlogPudoEndereco[] | null
  pudoHorario?: Record<string, string> | null
  pudoId?: string | null
  pudoTipo?: number | null
  razao?: string | null
  responsavel?: string | null
}

/** Documented response envelope: `{ "pudos": [ ... ] }`. */
export interface JadlogPudosResponse {
  pudos?: JadlogPudo[] | null
}

/**
 * `pais` is documented as "ISO 3 Dígitos, ex: BRA". The canonical Address wants
 * ISO 3166 alpha-2. Only the documented example is converted; any other value
 * is omitted rather than guessed.
 */
function toAlpha2(pais: string | null | undefined): string | undefined {
  return pais?.trim().toUpperCase() === 'BRA' ? 'BR' : undefined
}

/** `ativo` is documented as "S ou N". */
function toActive(ativo: string | null | undefined): boolean | undefined {
  const v = ativo?.trim().toUpperCase()
  if (v === 'S') return true
  if (v === 'N') return false
  return undefined
}

function toDate(raw: string | null | undefined): Date | undefined {
  if (!raw) return undefined
  const d = new Date(raw)
  return isNaN(d.getTime()) ? undefined : d
}

function toAddress(e: JadlogPudoEndereco | undefined): Address | undefined {
  if (!e) return undefined
  const street1 = [e.endereco, e.numero].filter((s) => s && s.trim()).join(', ') || undefined
  const address: Address = {
    street1,
    street2: e.compl2 || undefined,
    city: e.cidade || undefined,
    state: e.uf || undefined,
    postalCode: e.cep || undefined,
    country: toAlpha2(e.pais),
  }
  return Object.values(address).some((v) => v !== undefined) ? address : undefined
}

export function transformWarehouse(raw: JadlogPudo): Warehouse {
  if (!raw.pudoId) {
    throw new Error('Jadlog PUDO has no pudoId')
  }
  return {
    id: raw.pudoId,
    name: raw.razao || undefined,
    code: raw.pudoId,
    address: toAddress(raw.pudoEnderecoList?.[0]),
    isActive: toActive(raw.ativo),
    createdAt: toDate(raw.dt),
    metadata: raw as Record<string, unknown>,
  }
}
