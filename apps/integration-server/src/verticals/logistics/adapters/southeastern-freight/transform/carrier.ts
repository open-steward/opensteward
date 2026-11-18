import type { Carrier } from '../../../schema/carrier'

/**
 * SEFL is itself the single LTL carrier.  The SEFL REST API (Pickup, Tracing,
 * Rate Quotes, Document Retrieval, Get Pro) has no /carriers list endpoint, so
 * this adapter surfaces a static carrier record derived from the platform
 * constants.
 *
 * Source: https://www.sefl.com/seflWebsite/webconnect.jsp
 */
export function transformCarrier(): Carrier {
  return {
    id: 'southeastern-freight',
    name: 'Southeastern Freight Lines',
    code: 'SEFL',
    trackingUrlTemplate:
      'https://www.sefl.com/webconnect/tracing?Type=PN&RefNum1={trackingNumber}&output=JSON',
    services: [{ code: 'SEFL_LTL', name: 'SEFL LTL' }],
    isActive: true,
    metadata: { platform: 'southeastern-freight' },
  }
}
