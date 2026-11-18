export const metadata = {
  platform: 'correo-argentino',
  totalResources: 8,
  availableResources: [
    'shipment',
    'trackingevent',
    'rate',
    'warehouse',
    'label',
  ],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'Correo Argentino is a single national postal carrier; the MiCorreo v1 API has no carrier-list endpoint',
    },
    {
      resource: 'manifest',
      reason: 'No manifest endpoint in the MiCorreo v1 API; the PAQ.AR v2 API may expose manifests but requires a separate commercial agreement and login-gated credentials',
    },
    {
      resource: 'order',
      reason: 'No order-list or order-management endpoint in the MiCorreo v1 API; shipment creation via /shipping/import does not expose a separate order resource',
    },
  ],
} as const
