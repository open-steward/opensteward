export const metadata = {
  platform: 'oca',
  totalResources: 8,
  availableResources: ['label', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'UNVERIFIED: OCA is a single-carrier platform; no carrier-catalog endpoint found in documented REST API (api.oca.com.ar/v1); full private API docs require login credentials',
    },
    {
      resource: 'manifest',
      reason: 'UNVERIFIED: No manifest endpoint found in the documented OCA REST or ePak APIs; official docs at developers.oca.com.ar do not expose a manifest resource',
    },
    {
      resource: 'order',
      reason: 'UNVERIFIED: ePak SOAP API exposes IngresoORMultiplesRetiros (XML pickup orders) but no equivalent order endpoint is confirmed in the modern REST API (api.oca.com.ar/v1)',
    },
    {
      resource: 'rate',
      reason: 'UNVERIFIED: ePak SOAP exposes Tarifar_Envio_Corporativo but no /rates or /tarifas endpoint is confirmed in the modern REST API (api.oca.com.ar/v1) used by this adapter',
    },
    {
      resource: 'warehouse',
      reason: 'UNVERIFIED: ePak SOAP exposes GetCentrosImposicionConServiciosByCP (branches by postal code) but no /sucursales or warehouse endpoint is confirmed in the modern REST API (api.oca.com.ar/v1)',
    },
  ],
} as const
