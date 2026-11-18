/**
 * eGestor Contatos → canonical Contact transform.
 *
 * eGestor "contatos" endpoint: GET /api/v1/contatos
 * tipo: array of strings — can include "cliente", "fornecedor", "transportadora"
 * A single contact can be both customer and supplier simultaneously.
 */
import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toAddress, nonempty } from '../../shared/transform'

export interface EgestorContato {
  codigo: string | number
  /** Array of roles: "cliente", "fornecedor", "transportadora" */
  tipo?: string[]
  nome?: string
  fantasia?: string
  nomeParaContato?: string
  cpfcnpj?: string
  clienteFinal?: boolean
  indicadorIE?: number
  inscricaoEstadual?: string
  inscricaoEstadualST?: string
  inscricaoMunicipal?: string
  suframa?: string
  /** Array of email strings */
  emails?: string[]
  logradouro?: string
  numero?: string
  complemento?: string
  bairro?: string
  cidade?: string
  codIBGE?: string
  uf?: string
  cep?: string
  pais?: string
  /** Array of phone number strings */
  fones?: string[]
  tags?: string[]
  obs?: string
  dtNasc?: string
  dtCad?: string
  logradouroEntrega?: string
  numeroEntrega?: string
  complementoEntrega?: string
  bairroEntrega?: string
  cidadeEntrega?: string
  ufEntrega?: string
  cepEntrega?: string | number
  [key: string]: unknown
}

export function transformContact(raw: EgestorContato): Contact {
  const tipos = raw.tipo ?? []
  const isCustomer = tipos.includes('cliente')
  const isSupplier = tipos.includes('fornecedor')

  // Build emails from the emails array
  const emails = (raw.emails ?? [])
    .filter(Boolean)
    .map((e) => ({ email: e, type: 'WORK' as const }))

  // Build telephones from the fones array
  const telephones: Telephone[] = (raw.fones ?? [])
    .filter(Boolean)
    .map((t) => ({ telephone: t, type: 'WORK' as const }))

  const billingAddress = toAddress({
    address1: raw.logradouro
      ? `${raw.logradouro}${raw.numero ? `, ${raw.numero}` : ''}`
      : undefined,
    address2: raw.complemento || raw.bairro || undefined,
    city: raw.cidade || undefined,
    postalCode: raw.cep || undefined,
    country: raw.pais ? raw.pais.substring(0, 2).toUpperCase() : (raw.uf ? 'BR' : undefined),
    region: raw.uf || undefined,
  })

  const shippingAddress =
    raw.logradouroEntrega
      ? toAddress({
          address1: `${raw.logradouroEntrega}${raw.numeroEntrega ? `, ${raw.numeroEntrega}` : ''}`,
          address2: raw.complementoEntrega || raw.bairroEntrega || undefined,
          city: raw.cidadeEntrega || undefined,
          postalCode: raw.cepEntrega ? String(raw.cepEntrega) : undefined,
          region: raw.ufEntrega || undefined,
          country: 'BR',
        })
      : undefined

  return {
    id: String(raw.codigo),
    name: raw.fantasia || raw.nome || undefined,
    companyName: raw.nome || undefined,
    identification: raw.cpfcnpj || undefined,
    taxNumber: raw.inscricaoEstadual || undefined,
    isCustomer: isCustomer || (!isCustomer && !isSupplier) || undefined,
    isSupplier: isSupplier || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress,
    shippingAddress,
    createdAt: raw.dtCad ? new Date(raw.dtCad) : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
