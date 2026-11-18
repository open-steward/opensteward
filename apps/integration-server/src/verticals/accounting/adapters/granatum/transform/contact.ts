/**
 * Granatum clientes / fornecedores → canonical Contact.
 *
 * Granatum keeps clients (clientes) and suppliers (fornecedores) in separate
 * endpoints but uses essentially the same shape. A record may have both
 * `cliente: true` and `fornecedor: true` flags simultaneously.
 *
 * Note: Granatum does not expose ISO country codes; the `estado` sub-object
 * contains the Brazilian state abbreviation (e.g. "SP") which we map to
 * the `region` field. Country is always "BR" for domestic records unless
 * `estrangeiro` is true, in which case we leave it undefined.
 */
import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface GranatumPessoa {
  id: number
  nome: string | null
  nome_fantasia: string | null
  documento: string | null
  inscricao_estadual: string | null
  inscricao_municipal: string | null
  telefone: string | null
  email: string | null
  endereco: string | null
  endereco_numero: string | null
  endereco_complemento: string | null
  bairro: string | null
  cep: string | null
  cidade_id: number | null
  estado_id: number | null
  ativo: boolean
  cliente: boolean
  fornecedor: boolean
  estrangeiro: boolean
  estado: { sigla?: string } | null
  cidade: { nome?: string } | null
  [key: string]: unknown
}

export function transformContact(raw: GranatumPessoa): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.telefone) telephones.push({ telephone: raw.telefone, type: 'WORK' })

  // Compose display name: prefer nome_fantasia (trade name) over legal nome
  const name = (raw.nome_fantasia || raw.nome) ?? undefined

  const stateCode = raw.estado?.sigla || undefined
  const cityName = raw.cidade?.nome || undefined

  // Build address — Granatum uses only address1 (street + number) and
  // complemento. We compose them into address1 / address2.
  const streetParts = [raw.endereco, raw.endereco_numero].filter(Boolean)
  const address1 = streetParts.length ? streetParts.join(', ') : undefined

  return {
    id: String(raw.id),
    name,
    companyName: raw.nome || undefined,
    identification: raw.documento || undefined,
    taxNumber: raw.inscricao_estadual || raw.inscricao_municipal || undefined,
    isCustomer: raw.cliente,
    isSupplier: raw.fornecedor,
    isActive: raw.ativo,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1,
      address2: raw.endereco_complemento || undefined,
      city: cityName,
      region: stateCode,
      postalCode: raw.cep || undefined,
      country: raw.estrangeiro ? undefined : 'BR',
    }),
    metadata: raw as Record<string, unknown>,
  }
}
