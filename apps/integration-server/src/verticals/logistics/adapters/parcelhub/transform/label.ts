import type { Label, LabelFormat } from '../../../schema/label'
import { child, childrenNamed, textOf, type XmlNode } from '../xml'

// ─── Parcelhub label source ─────────────────────────────────────────────────
// GET /1.0/Shipment/{id} (https://api.parcelhub.net/docs/shippingAPI/get-shipment/,
// "Get details on a shipment by providing the Shipment ID in the URL") returns a
// <Shipment>. Labels hang off each package:
//   Packages/Package/PackageShippingInfo/Labels/Label
//     LabelData   — "Base64 Encoded label"
//     LabelSize   — "Size of label, either 6 or 8 inches"
//     LabelFormat — "Label Format - i.e ZPL, PNG or PDF"
//     Printed     — boolean
//   Packages/Package/PackageShippingInfo/CourierTrackingNumber
// plus ParcelhubShipmentId ("Parcelhub Generated Identifier"), ServiceInfo
// (ServiceId, ServiceProviderId) and Deleted (boolean).
//
//   ShippingInfo/CourierTrackingNumber — the shipment's own tracking number.
//
// ShippingInfo/ShipmentLabels is also documented (items titled "ShipmentLabel":
// labelData, labelSize, labelFormat, rawLabelData, printed), but it is not read:
// the docs give no example with items, so the item element name is unknown (the
// package items are titled "PackageLabel" yet serialise as <Label>), and unlike
// the package label its labelData carries no "Base64 Encoded label" description.
//
// CreationDate and ModifiedTime carry no zone offset in the docs' examples
// (2025-03-26T14:36:56.073) and the docs name no zone, so they stay in metadata.

const FORMATS: readonly LabelFormat[] = ['PDF', 'PNG', 'ZPL', 'EPL2']

function mapFormat(raw: string | undefined): LabelFormat | undefined {
  if (!raw) return undefined
  const upper = raw.toUpperCase() as LabelFormat
  return FORMATS.includes(upper) ? upper : 'unknown'
}

// Deleted is a documented boolean. Anything else (absent, nil) leaves status unset.
function mapStatus(deleted: string | undefined): Label['status'] {
  if (deleted === 'true') return 'VOIDED'
  if (deleted === 'false') return 'CREATED'
  return undefined
}

interface PackageLabel {
  courierTrackingNumber: string | undefined
  labelData: string | undefined
  labelSize: string | undefined
  labelFormat: string | undefined
  printed: string | undefined
}

function packageLabels(shipment: XmlNode): PackageLabel[] {
  const out: PackageLabel[] = []
  for (const pkg of childrenNamed(child(shipment, 'Packages'), 'Package')) {
    const info = child(pkg, 'PackageShippingInfo')
    const courierTrackingNumber = textOf(info, 'CourierTrackingNumber')
    for (const label of childrenNamed(child(info, 'Labels'), 'Label')) {
      out.push({
        courierTrackingNumber,
        labelData: textOf(label, 'LabelData'),
        labelSize: textOf(label, 'LabelSize'),
        labelFormat: textOf(label, 'LabelFormat'),
        printed: textOf(label, 'Printed'),
      })
    }
  }
  return out
}

/**
 * The label of a Parcelhub shipment, keyed by its ParcelhubShipmentId. The
 * first package's label fills the canonical fields; every package label is
 * kept in metadata.packageLabels so multi-package shipments lose nothing.
 */
export function transformLabel(shipment: XmlNode): Label {
  const shipmentId = textOf(shipment, 'ParcelhubShipmentId')
  if (!shipmentId) throw new Error('Parcelhub shipment carried no ParcelhubShipmentId')
  const serviceInfo = child(shipment, 'ServiceInfo')
  const labels = packageLabels(shipment)
  const first = labels[0]

  return {
    id: shipmentId,
    shipmentId,
    // The tracking number that belongs to the label body; with no package label,
    // the shipment's documented ShippingInfo/CourierTrackingNumber.
    trackingNumber: first
      ? first.courierTrackingNumber
      : textOf(child(shipment, 'ShippingInfo'), 'CourierTrackingNumber'),
    carrierId: textOf(serviceInfo, 'ServiceProviderId'),
    serviceCode: textOf(serviceInfo, 'ServiceId'),
    format: mapFormat(first?.labelFormat),
    status: mapStatus(textOf(shipment, 'Deleted')),
    base64: first?.labelData,
    metadata: {
      account: textOf(shipment, 'Account'),
      creationDate: textOf(child(shipment, 'ShippingInfo'), 'CreationDate'),
      modifiedTime: textOf(shipment, 'ModifiedTime'),
      serviceProviderName: textOf(child(shipment, 'ShippingInfo'), 'ServiceProviderName'),
      labelSize: first?.labelSize,
      printed: first?.printed === undefined ? undefined : first.printed === 'true',
      packageLabels: labels.map((l) => ({
        courierTrackingNumber: l.courierTrackingNumber,
        labelFormat: l.labelFormat,
        labelSize: l.labelSize,
        labelData: l.labelData,
      })),
    },
  }
}
