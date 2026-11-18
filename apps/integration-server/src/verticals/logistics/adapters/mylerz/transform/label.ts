import type { Label } from '../../../schema/label'
import type { MylerzDescriptive } from '../client'

/**
 * POST api/packages/GetAWB
 * (https://integration.mylerz.net/Help/Api/POST-api-packages-GetAWB) returns a
 * `DescriptiveResponseOfByte[]`, whose Value serialises as a base64 string
 * (sample: `"Value": "QEA="`). The official Mylerz WooCommerce plugin prints
 * each Value as a PDF (assets/js/bulk_print_awb.js: "Merge PDFs and initiate
 * print", `Uint8Array.from(atob(awb), ...)`).
 */
export type MylerzAWBResponse = MylerzDescriptive<string>

export function transformLabel(raw: MylerzAWBResponse, barcode?: string): Label {
  return {
    id: barcode ?? undefined,
    shipmentId: barcode ?? undefined,
    trackingNumber: barcode ?? undefined,
    carrierId: 'mylerz',
    format: 'PDF',
    status: 'CREATED',
    base64: raw.Value ?? undefined,
  }
}
