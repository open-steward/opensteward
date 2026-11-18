/**
 * What each vertical's sandbox serves, and the shape of a declaration.
 * This module holds the vertical-agnostic parts.
 *
 * Adding a vertical is: write its `sandbox/resources.ts`, add one line to
 * `SANDBOX_MANIFESTS`, and register its plugin in the sandbox mount.
 * `check:sandbox-coverage` then holds its method names to the real interface.
 */
import { SANDBOX_RESOURCES as ACCOUNTING } from '../verticals/accounting/sandbox/resources'
import { SANDBOX_RESOURCES as CUSTOMER_SUPPORT } from '../verticals/customer-support/sandbox/resources'
import { SANDBOX_RESOURCES as ECOMMERCE } from '../verticals/ecommerce/sandbox/resources'
import { SANDBOX_RESOURCES as INVENTORY } from '../verticals/inventory/sandbox/resources'
import { SANDBOX_RESOURCES as LOGISTICS } from '../verticals/logistics/sandbox/resources'
import { SANDBOX_RESOURCES as CRM } from '../verticals/crm/sandbox/resources'
import { SANDBOX_RESOURCES as DOCSIGN } from '../verticals/docsign/sandbox/resources'
import { SANDBOX_RESOURCES as PAYMENTS } from '../verticals/payments/sandbox/resources'
import { SANDBOX_RESOURCES as PROJECTS } from '../verticals/projects/sandbox/resources'
import type { SandboxResourceSpec } from './resource-spec'

export type { SandboxResourceSpec } from './resource-spec'

/**
 * Every vertical with a sandbox, keyed by its slug.
 *
 * Keyed by a literal rather than each vertical's exported `VERTICAL` constant,
 * deliberately. That constant lives in `verticals/<v>/index.ts`, which also
 * imports `ADAPTER_FACTORIES` — 283 adapter clients, every one of them capable
 * of an outbound request. Importing it here to save retyping one word would
 * drag the entire adapter graph into the sandbox subtree and end its
 * no-egress property. `check:sandbox-egress` catches exactly that.
 *
 * The cost is a string that could be misspelled, which
 * `check:sandbox-coverage` checks against the vertical directories.
 */
export const SANDBOX_MANIFESTS: Record<string, readonly SandboxResourceSpec[]> = {
  accounting: ACCOUNTING,
  crm: CRM,
  'customer-support': CUSTOMER_SUPPORT,
  ecommerce: ECOMMERCE,
  inventory: INVENTORY,
  logistics: LOGISTICS,
  docsign: DOCSIGN,
  payments: PAYMENTS,
  projects: PROJECTS,
}

/** The verticals the sandbox mounts, in a stable order. */
export const SANDBOX_VERTICALS: readonly string[] = Object.keys(SANDBOX_MANIFESTS).sort()

export function sandboxSpecsFor(vertical: string): readonly SandboxResourceSpec[] {
  return SANDBOX_MANIFESTS[vertical] ?? []
}
