export const metadata = {
  platform: 'pochta-russia',
  totalResources: 8,
  availableResources: ['carrier', 'label', 'manifest', 'order', 'rate', 'shipment'],
  unavailableResources: [
    {
      resource: 'warehouse',
      reason:
        'The Otpravka API has no warehouse endpoint. The lapaygroup/RussianPost SDK explicitly documents that this functionality does not work in the Russian Post API.',
    },
    {
      resource: 'trackingevent',
      reason:
        'Its tracking service answers one item per call ("за одно обращение к Сервису отслеживания получить информацию по одному регистрируемому почтовому отправлению"), over SOAP with separate credentials',
    },
  ],
} as const
