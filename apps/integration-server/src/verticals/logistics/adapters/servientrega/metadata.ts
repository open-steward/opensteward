export const metadata = {
  platform: 'servientrega',
  totalResources: 8,
  availableResources: ['rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason:
        'UNVERIFIED: The Servientrega developer portal (developer.servientrega.com) requires authenticated login; no public REST documentation confirms a carrier-discovery endpoint. The known SOAP web service exposes only shipment creation, status, and cancellation operations.',
    },
    {
      resource: 'label',
      reason:
        'UNVERIFIED: The Servientrega developer portal (developer.servientrega.com) requires authenticated login; no public REST documentation confirms a label endpoint. The SOAP-based CargueMasivoExterno method creates guides but does not return a structured label URL or base64 payload in any publicly documented response schema.',
    },
    {
      resource: 'manifest',
      reason:
        'UNVERIFIED: The Servientrega developer portal (developer.servientrega.com) requires authenticated login; no public REST documentation confirms a manifest (planilla) endpoint. Third-party integration guides do not reference a manifest API.',
    },
    {
      resource: 'order',
      reason:
        'UNVERIFIED: The Servientrega developer portal (developer.servientrega.com) requires authenticated login; no public REST documentation confirms an order (pedido) endpoint. Servientrega is a carrier, not a multi-tenant OMS; order management is not referenced in any publicly available integration guide.',
    },
    {
      resource: 'warehouse',
      reason:
        'UNVERIFIED: The Servientrega developer portal (developer.servientrega.com) requires authenticated login; no public REST documentation confirms a warehouse (bodega) endpoint. Servientrega is a courier/carrier service and does not document a warehouse management API.',
    },
  ],
} as const
