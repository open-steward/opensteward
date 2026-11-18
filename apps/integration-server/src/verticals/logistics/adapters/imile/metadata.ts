export const metadata = {
  platform: 'imile',
  totalResources: 8,
  availableResources: ['carrier', 'label', 'order', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'manifest',
      reason:
        'iMile\'s public Open API catalog (https://developer.imile.com) documents no manifest endpoint; POST /order/pick/notify ("Schedule Pickup Time") schedules pickups and only "supports Australia manifest functionality"',
    },
    {
      resource: 'warehouse',
      reason:
        'Not yet mapped: iMile documents POST /client/wmsOrder/listWmsHouses ("Warehouse list", "used to get the list of all warehouses in a country", https://developer.imile.com/apis/details/1825828377301954562)',
    },
  ],
} as const
