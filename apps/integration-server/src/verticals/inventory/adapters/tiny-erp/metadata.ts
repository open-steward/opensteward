export const metadata = {
  platform: 'tiny-erp',
  totalResources: 7,
  availableResources: [
    'location',
    'product',
    'purchase-order',
    'stock-level',
    'supplier',
  ],
  unavailableResources: [
    {
      resource: 'stock-adjustment',
      reason:
        'Tiny ERP v3 public API (confirmed via swagger.json) has no standalone stock-adjustment endpoint; stock mutations are only indirect actions on invoices/orders (POST /notas/{id}/lancar-estoque etc.).',
    },
    {
      resource: 'stock-transfer',
      reason:
        'Tiny ERP v3 public API (confirmed via swagger.json) has no stock-transfer endpoint; the only stock endpoint is GET/POST /estoque/{idProduto} scoped to a single product.',
    },
  ],
} as const
