export const metadata = {
  platform: 'melhor-envio',
  totalResources: 8,
  availableResources: ['carrier', 'label', 'order', 'rate', 'shipment', 'trackingevent'],
  unavailableResources: [
    {
      resource: 'manifest',
      reason:
        'No manifest endpoint exists in the Melhor Envio API (confirmed via full reference index at docs.melhorenvio.com.br/llms.txt)',
    },
    {
      resource: 'warehouse',
      reason:
        'No warehouse endpoint exists; Melhor Envio is a freight-quotation and label service only, not a warehouse management system',
    },
  ],
} as const
