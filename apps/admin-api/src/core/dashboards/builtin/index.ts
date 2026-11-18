/**
 * Dashboards that ship with OpenSteward, defined in code so an upgrade can
 * improve them. They reference metrics from integration-server's catalog
 * (`apps/integration-server/src/data-access/metrics/catalog/`) by id;
 * `tests/unit/dashboards-routes.test.ts` keeps the two in step.
 */
import { ACCOUNTING, ACCOUNTING_AR_AP, ACCOUNTING_RISK } from './accounting'
import { CRM, CRM_RISK } from './crm'
import { DOCSIGN, DOCSIGN_RISK } from './docsign'
import { ECOMMERCE, ECOMMERCE_OPERATIONS, ECOMMERCE_RISK } from './ecommerce'
import { INVENTORY, INVENTORY_RISK } from './inventory'
import { LOGISTICS, LOGISTICS_RISK } from './logistics'
import { OVERVIEW } from './overview'
import { PAYMENTS, PAYMENTS_RISK, PAYMENTS_SUBSCRIPTIONS } from './payments'
import { PROJECTS, PROJECTS_RISK } from './projects'
import { SUPPORT, SUPPORT_RISK } from './support'
import type { BuiltinDashboard } from './types'

export type { BuiltinDashboard } from './types'

/**
 * In display order: the cross-vertical system health first, then each
 * vertical with its overview before its detail and risk dashboards.
 */
export const BUILTIN_DASHBOARDS: readonly BuiltinDashboard[] = [
  OVERVIEW,
  ACCOUNTING,
  ACCOUNTING_AR_AP,
  ACCOUNTING_RISK,
  PAYMENTS,
  PAYMENTS_SUBSCRIPTIONS,
  PAYMENTS_RISK,
  ECOMMERCE,
  ECOMMERCE_OPERATIONS,
  ECOMMERCE_RISK,
  CRM,
  CRM_RISK,
  SUPPORT,
  SUPPORT_RISK,
  LOGISTICS,
  LOGISTICS_RISK,
  INVENTORY,
  INVENTORY_RISK,
  PROJECTS,
  PROJECTS_RISK,
  DOCSIGN,
  DOCSIGN_RISK,
]

export function getBuiltinDashboard(id: string): BuiltinDashboard | null {
  return BUILTIN_DASHBOARDS.find((d) => d.id === id) ?? null
}
