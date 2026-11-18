import type { Rate } from '../../../schema/rate'
import { parseDecimal } from '../../shared/transform'

/**
 * Raw shape returned by POST /embarcador/api/frete/valor.
 *
 * The freight simulation endpoint returns a single rate object.
 * Fields reflect the Jadlog Embarcador API v2 specification.
 */
export interface JadlogFreteResponse {
  vltotal?: number | string | null    // total freight cost (BRL)
  vlfrete?: number | string | null    // base freight value (BRL)
  vlgris?: number | string | null     // GRIS (cargo security) surcharge
  vlcoleta?: number | string | null   // collection fee
  vlentrega?: number | string | null  // delivery fee
  vldtf?: number | string | null      // document tax fee
  prazo?: number | null               // estimated transit days
  modalidade?: number | null
  [key: string]: unknown
}

/**
 * Map a Jadlog modality code to a human-readable service name.
 */
function modalidadeToServiceName(modalidade: number | null | undefined): string | undefined {
  switch (modalidade) {
    case 0:  return 'Jadlog .COM'
    case 3:  return 'Jadlog Expresso'
    case 4:  return 'Jadlog Package'
    case 5:  return 'Jadlog Rodoviário'
    case 6:  return 'Jadlog Econômico'
    case 7:  return 'Jadlog Doc'
    case 8:  return 'Jadlog Corporate'
    case 9:  return 'Jadlog Internacional'
    case 10: return 'Jadlog Cargo'
    default: return undefined
  }
}

export function transformRate(raw: JadlogFreteResponse): Rate {
  const modalidade = raw.modalidade ?? undefined
  const serviceCode = modalidade != null ? String(modalidade) : undefined
  const totalAmount = parseDecimal(raw.vltotal ?? raw.vlfrete)

  return {
    carrierId: 'jadlog',
    serviceCode,
    serviceName: modalidadeToServiceName(modalidade),
    currency: 'BRL',
    totalAmount,
    transitDays: raw.prazo ?? undefined,
    deliveryDays: raw.prazo ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
