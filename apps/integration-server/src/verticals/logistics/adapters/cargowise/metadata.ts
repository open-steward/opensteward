export const metadata = {
  platform: 'cargowise',
  totalResources: 8,
  availableResources: ['shipment', 'order', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'carrier',
      reason: 'UNVERIFIED: CargoWise REST API docs are behind a customer-purchase gate (eAdaptor Developers Guide PDF); no public endpoint confirmed',
    },
    {
      resource: 'label',
      reason: 'UNVERIFIED: CargoWise REST API docs are behind a customer-purchase gate (eAdaptor Developers Guide PDF); no public endpoint confirmed',
    },
    {
      resource: 'manifest',
      reason: 'UNVERIFIED: CargoWise REST API docs are behind a customer-purchase gate (eAdaptor Developers Guide PDF); no public endpoint confirmed',
    },
    {
      resource: 'rate',
      reason: 'UNVERIFIED: CargoWise REST API docs are behind a customer-purchase gate (eAdaptor Developers Guide PDF); no public endpoint confirmed',
    },
    {
      resource: 'warehouse',
      reason: 'UNVERIFIED: CargoWise REST API docs are behind a customer-purchase gate (eAdaptor Developers Guide PDF); no public endpoint confirmed',
    },
  ],
} as const
