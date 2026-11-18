import { minorUnitExponent } from '@opensteward/shared'
import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import type { Address, Money } from '../../../schema/shared'
import { toISODate, toWeight, toDimensions } from '../../shared/transform'

/**
 * One package of `v1PackageDetailsResponse`, the 200 body of
 *   GET /v1/companies/{company_id}/packages/{tracking_code}
 * (https://docs.api.loggi.com/reference/packagedetailstrackingcode).
 *
 * Only the fields this transform reads are typed; every name below is a
 * property of that schema.
 */
export interface LoggiPackageStatus {
  /** "Código numérico referente ao estado do pacote." */
  code?: number | null
  /** "Status geral do pacote em formato legível." */
  highLevelStatus?: string | null
  /** "Breve descrição do status do pacote." */
  description?: string | null
  /** "Data que o pacote entrou no status atual." (date-time) */
  updatedTime?: string | null
}

export interface LoggiPackageDetails {
  /** "Chave que identifica unicamente um pacote dentro da Loggi." */
  loggiKey?: string | null
  /** "Código de rastreio de um pacote." */
  trackingCode?: string | null
  status?: LoggiPackageStatus | null
  destination?: {
    recipient?: { name?: string | null; phone?: string | null } | null
    postalAddress?: {
      regionCode?: string | null
      postalCode?: string | null
      administrativeArea?: string | null
      locality?: string | null
      addressLines?: string[] | null
    } | null
  } | null
  /** "Estimativa de data para a primeira tentativa de entrega." (date) */
  promisedDate?: string | null
  dimension?: {
    weightG?: number | null
    lengthCm?: number | null
    widthCm?: number | null
    heightCm?: number | null
  } | null
  origin?: { postalCode?: string | null } | null
  pricing?: {
    amount?: {
      /** ISO 4217 code, e.g. "BRL". */
      currencyCode?: string | null
      /** Integer part as a string: "Um envio com preço de 7,52 teria \"7\" units." */
      units?: string | null
      /** Fraction × 10⁹: "Um envio com preço de 7,52 teria 520000000 nanos." */
      nanos?: number | null
    } | null
  } | null
  [key: string]: unknown
}

export interface LoggiPackageDetailsResponse {
  packages?: LoggiPackageDetails[] | null
}

/**
 * Status codes from the V2 table at https://docs.api.loggi.com/reference/trackingapi
 * ("Lista de status da Loggi"). Codes absent from the table map to UNKNOWN.
 */
const SHIPMENT_STATUS_BY_CODE: Record<number, ShipmentStatus> = {
  1: 'LABEL_CREATED', // Adicionado no sistema
  2: 'CANCELLED', // Cancelado
  3: 'IN_TRANSIT', // Preparando para transferência
  4: 'IN_TRANSIT', // Preparando para entrega
  5: 'DELIVERED', // Entregue
  6: 'EXCEPTION', // Recusado pelo destinatário
  7: 'EXCEPTION', // Devolução iniciada
  8: 'RETURNED', // Devolvido
  9: 'EXCEPTION', // Extraviado
  10: 'IN_TRANSIT', // Retirar nos correios
  11: 'OUT_FOR_DELIVERY', // Em rota
  12: 'EXCEPTION', // Imprevisto na entrega
  13: 'IN_TRANSIT', // Conferido
  14: 'IN_TRANSIT', // Coletado
  15: 'IN_TRANSIT', // Medido e pesado
  16: 'IN_TRANSIT', // Saiu de uma base
  17: 'IN_TRANSIT', // Chegou em uma base
  18: 'EXCEPTION', // Destinatário ausente
  19: 'EXCEPTION', // Avariado
  20: 'EXCEPTION', // Pendência interna
  21: 'EXCEPTION', // Endereço errado
  22: 'EXCEPTION', // Aguardando ação do remetente
  23: 'EXCEPTION', // Roubado ou furtado
  24: 'EXCEPTION', // Aguardando liberação fiscal
  25: 'IN_TRANSIT', // Liberado pela fiscalização
  26: 'EXCEPTION', // Dados incorretos ou inválidos
  27: 'EXCEPTION', // Pacote não integrado
  28: 'PENDING', // Coleta pendente
  29: 'EXCEPTION', // Retido pela fiscalização
  30: 'IN_TRANSIT', // Entregue a transportadora
  31: 'EXCEPTION', // Falha na devolução
}

export function mapShipmentStatus(code: number | null | undefined): ShipmentStatus {
  if (code == null) return 'UNKNOWN'
  return SHIPMENT_STATUS_BY_CODE[code] ?? 'UNKNOWN'
}

/**
 * `pricing.amount` is a units/nanos pair. Both the currency and the integer
 * units must be present; the fraction comes from nanos at the currency's
 * minor-unit exponent.
 */
function toMoney(amount: NonNullable<LoggiPackageDetails['pricing']>['amount']): Money | undefined {
  const currency = amount?.currencyCode
  const units = amount?.units
  if (!currency || units == null || units === '') return undefined
  const whole = Number(units)
  if (!Number.isInteger(whole)) return undefined
  const exponent = minorUnitExponent(currency)
  const nanos = amount?.nanos ?? 0
  const fraction = Math.round(nanos / 10 ** (9 - exponent))
  return { amount: whole * 10 ** exponent + fraction, currency }
}

function toDestination(dest: LoggiPackageDetails['destination']): Address | undefined {
  if (!dest) return undefined
  const postal = dest.postalAddress
  const lines = postal?.addressLines ?? []
  const address: Address = {
    name: dest.recipient?.name ?? undefined,
    phone: dest.recipient?.phone ?? undefined,
    street1: lines[0] || undefined,
    street2: lines.length > 1 ? lines.slice(1).join(', ') : undefined,
    city: postal?.locality || undefined,
    state: postal?.administrativeArea || undefined,
    postalCode: postal?.postalCode || undefined,
  }
  return Object.values(address).some((v) => v !== undefined) ? address : undefined
}

export function transformPackage(raw: LoggiPackageDetails): Shipment {
  const dim = raw.dimension
  const statusCode = raw.status?.code
  return {
    id: raw.trackingCode ?? undefined,
    status: mapShipmentStatus(statusCode),
    trackingNumber: raw.trackingCode ?? undefined,
    carrierId: 'loggi',
    originAddress: raw.origin?.postalCode ? { postalCode: raw.origin.postalCode } : undefined,
    destinationAddress: toDestination(raw.destination),
    totalWeight: toWeight(dim?.weightG, 'g'),
    dimensions: toDimensions(dim?.lengthCm, dim?.widthCm, dim?.heightCm, 'cm'),
    estimatedDeliveryAt: toISODate(raw.promisedDate),
    actualDeliveryAt: statusCode === 5 ? toISODate(raw.status?.updatedTime) : undefined,
    cost: toMoney(raw.pricing?.amount),
    metadata: raw as Record<string, unknown>,
  }
}
