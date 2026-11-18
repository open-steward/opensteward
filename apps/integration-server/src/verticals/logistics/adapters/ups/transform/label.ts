import type { Label, LabelFormat } from '../../../schema/label'
import type { UPSShipmentResults } from './shipment'
import { parseDecimal } from '../../shared/transform'

function mapLabelFormat(code: string | undefined): LabelFormat | undefined {
  if (!code) return undefined
  const upper = code.toUpperCase()
  if (upper === 'PNG') return 'PNG'
  if (upper === 'GIF') return 'PNG'   // GIF is raster; closest canonical is PNG
  if (upper === 'ZPL') return 'ZPL'
  if (upper === 'EPL' || upper === 'EPL2') return 'EPL2'
  if (upper === 'PDF') return 'PDF'
  return undefined
}

export function transformLabel(raw: UPSShipmentResults, packageIndex = 0): Label {
  const pkg = raw.PackageResults?.[packageIndex]
  const totalCharges = raw.ShipmentCharges?.TotalCharges

  return {
    id: raw.ShipmentIdentificationNumber ?? undefined,
    shipmentId: raw.ShipmentIdentificationNumber ?? undefined,
    trackingNumber: pkg?.TrackingNumber ?? undefined,
    carrierId: 'UPS',
    format: mapLabelFormat(pkg?.ShippingLabel?.ImageFormat?.Code),
    base64: pkg?.ShippingLabel?.GraphicImage ?? undefined,
    status: 'CREATED',
    cost: totalCharges
      ? {
          amount: parseDecimal(totalCharges.MonetaryValue) ?? 0,
          currency: totalCharges.CurrencyCode ?? 'USD',
        }
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
