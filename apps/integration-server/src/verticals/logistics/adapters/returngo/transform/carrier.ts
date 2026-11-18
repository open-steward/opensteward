import type { Carrier } from '../../../schema/carrier'
import type { ReturnGoRma } from './rma'

/**
 * Derive a canonical Carrier from a ReturnGO RMA.
 *
 * ReturnGO does not expose a dedicated /carriers endpoint. Carrier identity
 * is surfaced as a string field (`carrier` / `shipment.carrier`) on each RMA.
 * This transform produces a minimal Carrier record keyed by that string.
 */
export function transformRmaToCarrier(raw: ReturnGoRma): Carrier | undefined {
  const carrierCode = raw.carrier ?? raw.shipment?.carrier
  if (!carrierCode) return undefined

  const code = String(carrierCode)

  return {
    id: code,
    name: code,
    code,
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}
