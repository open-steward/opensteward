export const metadata = {
  platform: 'estafeta',
  totalResources: 8,
  availableResources: ['rate', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'UNVERIFIED: Estafeta REST API portal (Layer7) is login-gated; no public /carriers endpoint confirmed',
    },
    {
      resource: 'label',
      reason:
        'UNVERIFIED: Estafeta has a legacy SOAP label service (labelqa.estafeta.com/EstafetaLabel20/services) but no confirmed REST endpoint at api.estafeta.com/v1/; developer portal is login-gated',
    },
    {
      resource: 'manifest',
      reason:
        'Manifesting is not supported or required for Estafeta (confirmed by EasyPost official carrier guide)',
    },
    {
      resource: 'order',
      reason: 'UNVERIFIED: Estafeta REST API portal is login-gated; no public /orders endpoint documented',
    },
    {
      resource: 'shipment',
      reason: 'UNVERIFIED: Estafeta REST API portal is login-gated; no public /shipments endpoint documented',
    },
    {
      resource: 'warehouse',
      reason: 'UNVERIFIED: Estafeta REST API portal is login-gated; no public /warehouses endpoint documented',
    },
  ],
} as const
