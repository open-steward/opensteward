export const metadata = {
  platform: 'averitt',
  totalResources: 8,
  availableResources: ['rate', 'trackingevent'],
  unavailableResources: [
    { resource: 'carrier', reason: 'Averitt REST API has no carrier profile endpoint; the platform only exposes tracking, rate quote, pickup request, and document retrieval APIs.' },
    { resource: 'label', reason: 'Averitt REST API has no label generation or retrieval endpoint; label PDFs are only accessible via the document request API (base64, not structured).' },
    { resource: 'manifest', reason: 'Averitt REST API has no manifest endpoint; the platform does not expose manifest creation or retrieval.' },
    { resource: 'order', reason: 'Averitt REST API has no order management endpoint; order number document request returns PDFs only, not structured order data.' },
    { resource: 'shipment', reason: 'Averitt REST API has no shipment management endpoint; the pickup request API creates pickup requests but does not return structured shipment records.' },
    { resource: 'warehouse', reason: 'Averitt REST API has no warehouse endpoint; the platform does not expose warehouse or service-center management.' },
  ],
} as const
