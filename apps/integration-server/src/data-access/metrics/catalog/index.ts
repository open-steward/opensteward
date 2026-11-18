/**
 * The metric catalog: every aggregate a dashboard can chart.
 *
 * One file per vertical (`<vertical>.ts`) plus `system.ts`; adding a metric
 * is adding an entry to its vertical's list — this index only concatenates.
 * `validate.ts` runs at load and in `tests/data-access/metrics-catalog.test.ts`:
 * every field a metric reads must exist on the canonical schema and must not
 * be classified `pii` or `secret` — a dashboard is shown to everyone with
 * `dashboards:view`, who may hold no PII permission at all. Financial fields
 * are allowed; their values are withheld when the deployment masks them.
 *
 * Paths follow each vertical's own wire casing: camelCase for most, snake_case
 * for CRM.
 */
import type { ResourceMetricDefinition } from '../types'
import { ACCOUNTING_METRICS } from './accounting'
import { CRM_METRICS } from './crm'
import { CUSTOMER_SUPPORT_METRICS } from './customer-support'
import { DOCSIGN_METRICS } from './docsign'
import { ECOMMERCE_METRICS } from './ecommerce'
import { INVENTORY_METRICS } from './inventory'
import { LOGISTICS_METRICS } from './logistics'
import { PAYMENTS_METRICS } from './payments'
import { PROJECTS_METRICS } from './projects'

export const RESOURCE_METRICS: readonly ResourceMetricDefinition[] = [
  ...ECOMMERCE_METRICS,
  ...ACCOUNTING_METRICS,
  ...CRM_METRICS,
  ...CUSTOMER_SUPPORT_METRICS,
  ...PAYMENTS_METRICS,
  ...LOGISTICS_METRICS,
  ...INVENTORY_METRICS,
  ...PROJECTS_METRICS,
  ...DOCSIGN_METRICS,
]

export { SYSTEM_METRICS } from './system'
export { defaultCharts, resourceMetricInfo, systemMetricInfo } from '../definition'
