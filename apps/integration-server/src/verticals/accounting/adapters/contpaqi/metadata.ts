export const metadata = {
  platform: 'contpaqi',
  totalResources: 13,
  availableResources: [],
  unavailableResources: [
    {
      resource: 'account',
      reason:
        'Every path this adapter called lives under https://api.contpaqi.com/v1, which returns HTTP 403 "Web App - Unavailable" (plain HTML, not an API gateway) on a live probe (2026-09-13); GET /cuentas is unreachable',
    },
    {
      resource: 'bill',
      reason:
        'Every path this adapter called lives under https://api.contpaqi.com/v1, which returns HTTP 403 "Web App - Unavailable" (plain HTML, not an API gateway) on a live probe (2026-09-13); GET /facturas-proveedor is unreachable',
    },
    {
      resource: 'contact',
      reason:
        'Every path this adapter called lives under https://api.contpaqi.com/v1, which returns HTTP 403 "Web App - Unavailable" (plain HTML, not an API gateway) on a live probe (2026-09-13); GET /clientes and /proveedores are unreachable',
    },
    {
      resource: 'creditmemo',
      reason:
        'Every path this adapter called lives under https://api.contpaqi.com/v1, which returns HTTP 403 "Web App - Unavailable" (plain HTML, not an API gateway) on a live probe (2026-09-13); GET /notas-credito is unreachable',
    },
    {
      resource: 'expense',
      reason:
        'Every path this adapter called lives under https://api.contpaqi.com/v1, which returns HTTP 403 "Web App - Unavailable" (plain HTML, not an API gateway) on a live probe (2026-09-13); GET /gastos is unreachable',
    },
    {
      resource: 'invoice',
      reason:
        'Every path this adapter called lives under https://api.contpaqi.com/v1, which returns HTTP 403 "Web App - Unavailable" (plain HTML, not an API gateway) on a live probe (2026-09-13); GET /facturas is unreachable',
    },
    {
      resource: 'journal',
      reason:
        'Every path this adapter called lives under https://api.contpaqi.com/v1, which returns HTTP 403 "Web App - Unavailable" (plain HTML, not an API gateway) on a live probe (2026-09-13); GET /polizas is unreachable',
    },
    {
      resource: 'order',
      reason:
        'Every path this adapter called lives under https://api.contpaqi.com/v1, which returns HTTP 403 "Web App - Unavailable" (plain HTML, not an API gateway) on a live probe (2026-09-13); GET /pedidos is unreachable',
    },
    {
      resource: 'organization',
      reason:
        'Every path this adapter called lives under https://api.contpaqi.com/v1, which returns HTTP 403 "Web App - Unavailable" (plain HTML, not an API gateway) on a live probe (2026-09-13); GET /empresas/actual is unreachable',
    },
    {
      resource: 'purchaseorder',
      reason:
        'Every path this adapter called lives under https://api.contpaqi.com/v1, which returns HTTP 403 "Web App - Unavailable" (plain HTML, not an API gateway) on a live probe (2026-09-13); GET /ordenes-compra is unreachable',
    },
    {
      resource: 'salesorder',
      reason:
        'Every path this adapter called lives under https://api.contpaqi.com/v1, which returns HTTP 403 "Web App - Unavailable" (plain HTML, not an API gateway) on a live probe (2026-09-13); GET /ordenes-venta is unreachable',
    },
    {
      resource: 'taxrate',
      reason:
        'Every path this adapter called lives under https://api.contpaqi.com/v1, which returns HTTP 403 "Web App - Unavailable" (plain HTML, not an API gateway) on a live probe (2026-09-13); GET /impuestos is unreachable',
    },
    {
      resource: 'transaction',
      reason:
        'Every path this adapter called lives under https://api.contpaqi.com/v1, which returns HTTP 403 "Web App - Unavailable" (plain HTML, not an API gateway) on a live probe (2026-09-13); GET /movimientos is unreachable',
    },
  ],
} as const
