export const metadata = {
  platform: 'total-express',
  totalResources: 8,
  availableResources: ['trackingevent', 'shipment'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'UNVERIFIED: Official REST API docs at totalexpress.com.br/desenvolvedores are inaccessible; all public sources confirm only a SOAP webservice (edi.totalexpress.com.br) covering shipment registration and tracking — no carrier endpoint documented.',
    },
    {
      resource: 'label',
      reason: 'UNVERIFIED: Official REST API docs at totalexpress.com.br/desenvolvedores are inaccessible; all public sources confirm only a SOAP webservice (edi.totalexpress.com.br) covering shipment registration and tracking — no label endpoint documented.',
    },
    {
      resource: 'manifest',
      reason: 'UNVERIFIED: Official REST API docs at totalexpress.com.br/desenvolvedores are inaccessible; all public sources confirm only a SOAP webservice (edi.totalexpress.com.br) covering shipment registration and tracking — no manifest endpoint documented.',
    },
    {
      resource: 'order',
      reason: 'UNVERIFIED: Official REST API docs at totalexpress.com.br/desenvolvedores are inaccessible; all public sources confirm only a SOAP webservice (edi.totalexpress.com.br) covering shipment registration and tracking — no order endpoint documented.',
    },
    {
      resource: 'rate',
      reason: 'UNVERIFIED: Official REST API docs at totalexpress.com.br/desenvolvedores are inaccessible; Total Express freight calculation is via SOAP at edi.totalexpress.com.br/webservice_calculo_frete.php — no REST rate endpoint documented.',
    },
    {
      resource: 'warehouse',
      reason: 'UNVERIFIED: Official REST API docs at totalexpress.com.br/desenvolvedores are inaccessible; all public sources confirm only a SOAP webservice (edi.totalexpress.com.br) covering shipment registration and tracking — no warehouse endpoint documented.',
    },
  ],
} as const
