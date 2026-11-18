/**
 * Catalogue of canonical resources exposed by the MCP server, keyed on
 * the `/v1/{vertical}/{resource}` route paths the integration-server
 * already serves. New adapters do not require a change here — every
 * adapter inside a vertical implements the same canonical methods
 * against the same canonical schema, so adding `@opensteward/foo`
 * just makes `foo` a valid `connection_id` for the existing tools.
 *
 * Hand-maintained for V1 to keep the MCP package free of any runtime
 * dependency on integration-server's source. When a new resource type
 * is added (rare — happens at the canonical-schema level, not the
 * adapter level), bump the list here and ship a new MCP version.
 *
 * Names that collide across verticals (`contacts`, `orders`,
 * `transactions`, `customers`) get a vertical prefix at the tool level
 * (see `tool-registry.ts`); the catalogue itself stays clean.
 */

export type Vertical =
  | 'accounting'
  | 'crm'
  | 'ecommerce'
  | 'logistics'
  | 'payments'
  | 'docsign'
  | 'projects'
  | 'customer-support'
  | 'inventory'

export interface ResourceDef {
  /** Vertical the resource lives under. */
  vertical: Vertical
  /** REST path segment (`/v1/{vertical}/{path}`). Plural in 99% of cases. */
  path: string
  /** Singular form used in tool names — `list_invoice` reads worse than
   *  `list_invoices`, so the tool generator pluralises by default and
   *  uses this only when the singular reads better (e.g. `inventory`). */
  toolBase: string
  /** Description shown to the agent. One line, action-focused. */
  description: string
  /** When true, only the `get_*` tool is emitted (no list — singletons). */
  singleton?: boolean
}

export const RESOURCES: ReadonlyArray<ResourceDef> = [
  // ── accounting ────────────────────────────────────────────────────────
  { vertical: 'accounting', path: 'organizations', toolBase: 'organization',
    description: 'The company / organization profile attached to an accounting connection.',
    singleton: true },
  { vertical: 'accounting', path: 'invoices', toolBase: 'invoices',
    description: 'Customer-facing invoices (accounts receivable).' },
  { vertical: 'accounting', path: 'bills', toolBase: 'bills',
    description: 'Vendor bills (accounts payable).' },
  { vertical: 'accounting', path: 'contacts', toolBase: 'contacts',
    description: 'Counterparties (customers / suppliers / vendors) on an accounting connection.' },
  { vertical: 'accounting', path: 'accounts', toolBase: 'accounts',
    description: 'Chart of accounts: GL accounts, codes, types.' },
  { vertical: 'accounting', path: 'journals', toolBase: 'journals',
    description: 'Journal entries — manual and system-generated postings.' },
  { vertical: 'accounting', path: 'transactions', toolBase: 'transactions',
    description: 'Transactional records: payments, receipts, transfers, reconciled bank lines.' },
  { vertical: 'accounting', path: 'taxrates', toolBase: 'tax_rates',
    description: 'Tax rates configured in the accounting platform.' },
  { vertical: 'accounting', path: 'expenses', toolBase: 'expenses',
    description: 'Expense records — receipts, employee expenses, mileage.' },
  { vertical: 'accounting', path: 'creditmemos', toolBase: 'credit_memos',
    description: 'Credit notes issued against invoices or bills.' },
  { vertical: 'accounting', path: 'orders', toolBase: 'orders',
    description: 'Sales / purchase orders surfaced by accounting platforms that track them.' },
  { vertical: 'accounting', path: 'salesorders', toolBase: 'sales_orders',
    description: 'Standalone sales orders (where distinct from `orders`).' },
  { vertical: 'accounting', path: 'purchaseorders', toolBase: 'purchase_orders',
    description: 'Standalone purchase orders.' },

  // ── crm ───────────────────────────────────────────────────────────────
  { vertical: 'crm', path: 'contacts', toolBase: 'contacts',
    description: 'CRM contacts — individual people the company tracks.' },
  { vertical: 'crm', path: 'companies', toolBase: 'companies',
    description: 'CRM companies / accounts — organizational records contacts roll up to.' },
  { vertical: 'crm', path: 'deals', toolBase: 'deals',
    description: 'Sales opportunities / deals / pipeline records.' },
  { vertical: 'crm', path: 'pipelines', toolBase: 'pipelines',
    description: 'Pipeline definitions: stages, names, ordering.' },
  { vertical: 'crm', path: 'activities', toolBase: 'activities',
    description: 'Activities logged against contacts / deals (calls, meetings, emails).' },
  { vertical: 'crm', path: 'notes', toolBase: 'notes',
    description: 'Free-text notes on contacts / companies / deals.' },

  // ── ecommerce ─────────────────────────────────────────────────────────
  { vertical: 'ecommerce', path: 'products', toolBase: 'products',
    description: 'Storefront products (parent SKUs).' },
  { vertical: 'ecommerce', path: 'variants', toolBase: 'variants',
    description: 'Product variants / SKUs (size / colour / option permutations).' },
  { vertical: 'ecommerce', path: 'collections', toolBase: 'collections',
    description: 'Product collections / categories used for merchandising.' },
  { vertical: 'ecommerce', path: 'locations', toolBase: 'locations',
    description: 'Warehouses / fulfilment locations / pickup points.' },
  { vertical: 'ecommerce', path: 'inventory_levels', toolBase: 'inventory_levels',
    description: 'Stock-on-hand per (location, variant).' },
  { vertical: 'ecommerce', path: 'customers', toolBase: 'customers',
    description: 'Storefront customers (the merchant\'s buyers).' },
  { vertical: 'ecommerce', path: 'orders', toolBase: 'orders',
    description: 'Storefront orders.' },
  { vertical: 'ecommerce', path: 'fulfillments', toolBase: 'fulfillments',
    description: 'Order fulfilments / shipments.' },
  { vertical: 'ecommerce', path: 'refunds', toolBase: 'refunds',
    description: 'Refunds against storefront orders.' },
  { vertical: 'ecommerce', path: 'transactions', toolBase: 'transactions',
    description: 'Payment transactions on storefront orders.' },
  { vertical: 'ecommerce', path: 'discounts', toolBase: 'discounts',
    description: 'Discount codes / promotions.' },

  // ── logistics ─────────────────────────────────────────────────────────
  { vertical: 'logistics', path: 'carriers', toolBase: 'carriers',
    description: 'Configured shipping carriers on the logistics connection.' },
  { vertical: 'logistics', path: 'shipments', toolBase: 'shipments',
    description: 'Outbound shipments tracked by the logistics platform.' },
  { vertical: 'logistics', path: 'tracking-events', toolBase: 'tracking_events',
    description: 'Per-shipment tracking events (in transit, out for delivery, delivered, exception).' },
  { vertical: 'logistics', path: 'orders', toolBase: 'orders',
    description: 'Logistics-side orders / dispatches.' },
  { vertical: 'logistics', path: 'rates', toolBase: 'rates',
    description: 'Shipping rate quotes.' },
  { vertical: 'logistics', path: 'labels', toolBase: 'labels',
    description: 'Issued shipping labels.' },
  { vertical: 'logistics', path: 'manifests', toolBase: 'manifests',
    description: 'Carrier manifests / end-of-day batch handoffs.' },
  { vertical: 'logistics', path: 'pickups', toolBase: 'pickups',
    description: 'Scheduled carrier pickups — collection requests with a ready / close window and a carrier confirmation number.' },
  { vertical: 'logistics', path: 'warehouses', toolBase: 'warehouses',
    description: 'Warehouses / origin locations.' },

  // ── payments ──────────────────────────────────────────────────────────
  { vertical: 'payments', path: 'customers', toolBase: 'customers',
    description: 'Gateway customer records (the buyer/payer the gateway tracks).' },
  { vertical: 'payments', path: 'payment_methods', toolBase: 'payment_methods',
    description: 'Saved payment methods — cards, bank accounts, wallets, mandates.' },
  { vertical: 'payments', path: 'charges', toolBase: 'charges',
    description: 'Charge / payment-intent records with refund and dispute references.' },
  { vertical: 'payments', path: 'refunds', toolBase: 'refunds',
    description: 'Refunds issued against charges.' },
  { vertical: 'payments', path: 'subscriptions', toolBase: 'subscriptions',
    description: 'Recurring-billing subscriptions and their items, periods, and dunning state.' },
  { vertical: 'payments', path: 'invoices', toolBase: 'payment_invoices',
    description: 'Gateway invoices (subscription-generated and standalone).' },
  { vertical: 'payments', path: 'payouts', toolBase: 'payouts',
    description: 'Gateway-to-bank settlements / payouts.' },
  { vertical: 'payments', path: 'disputes', toolBase: 'disputes',
    description: 'Chargebacks / disputes and their evidence-submission deadlines.' },
  { vertical: 'payments', path: 'plans', toolBase: 'plans',
    description: 'Catalog: subscription plans (Tier-2; not every gateway exposes Plan as a record).' },
  { vertical: 'payments', path: 'prices', toolBase: 'prices',
    description: 'Catalog: prices for products (Tier-2).' },
  { vertical: 'payments', path: 'products', toolBase: 'payment_products',
    description: 'Catalog: products that are sold under one or more prices (Tier-2).' },
  { vertical: 'payments', path: 'balance_transactions', toolBase: 'balance_transactions',
    description: 'Ledger of every balance-affecting event: charges, refunds, payouts, fees, adjustments.' },

  // ── docsign ───────────────────────────────────────────────────────────
  { vertical: 'docsign', path: 'envelopes', toolBase: 'envelopes',
    description: 'Signing envelopes — the parent container that bundles documents, signers, and routing.' },
  { vertical: 'docsign', path: 'documents', toolBase: 'documents',
    description: 'Documents attached to a signing envelope (PDFs / files awaiting signature).' },
  { vertical: 'docsign', path: 'signers', toolBase: 'signers',
    description: 'Signers / recipients on an envelope with their routing order and signing status.' },
  { vertical: 'docsign', path: 'templates', toolBase: 'templates',
    description: 'Re-usable envelope templates with pre-placed signature fields.' },
  { vertical: 'docsign', path: 'audit_trail_entries', toolBase: 'audit_trail_entries',
    description: 'Per-envelope audit trail entries (open / sign / decline events with timestamps and IPs).' },

  // ── projects ──────────────────────────────────────────────────────────
  { vertical: 'projects', path: 'workspaces', toolBase: 'workspaces',
    description: 'Top-level container for projects (org / space / team in different platforms).' },
  { vertical: 'projects', path: 'projects', toolBase: 'projects',
    description: 'Projects — the work container that groups tasks under a goal or deliverable.' },
  { vertical: 'projects', path: 'tasks', toolBase: 'tasks',
    description: 'Tasks / tickets / issues — atomic work items with assignees, status, and due dates.' },
  { vertical: 'projects', path: 'comments', toolBase: 'project_comments',
    description: 'Comments attached to projects or tasks.' },
  { vertical: 'projects', path: 'tags', toolBase: 'project_tags',
    description: 'Labels / tags used for task categorisation.' },
  { vertical: 'projects', path: 'users', toolBase: 'project_users',
    description: 'Users / members on the project-management workspace.' },

  // ── customer-support ──────────────────────────────────────────────────
  { vertical: 'customer-support', path: 'tickets', toolBase: 'tickets',
    description: 'Support tickets — customer-raised issues tracked by the help-desk platform.' },
  { vertical: 'customer-support', path: 'messages', toolBase: 'ticket_messages',
    description: 'Messages exchanged on a ticket (customer replies, agent replies, internal notes).' },
  { vertical: 'customer-support', path: 'contacts', toolBase: 'support_contacts',
    description: 'End-customer contact records the help desk tracks (the person who raised tickets).' },
  { vertical: 'customer-support', path: 'users', toolBase: 'support_users',
    description: 'Help-desk agents / users (the internal staff who answer tickets).' },
  { vertical: 'customer-support', path: 'teams', toolBase: 'support_teams',
    description: 'Agent teams / groups used for ticket routing and assignment.' },
  { vertical: 'customer-support', path: 'tags', toolBase: 'support_tags',
    description: 'Tags used to categorise tickets.' },
  { vertical: 'customer-support', path: 'macros', toolBase: 'macros',
    description: 'Saved reply / action templates agents apply to tickets.' },

  // ── inventory ─────────────────────────────────────────────────────────
  { vertical: 'inventory', path: 'products', toolBase: 'inventory_products',
    description: 'Stock-keeping products / SKUs tracked by the inventory platform.' },
  { vertical: 'inventory', path: 'locations', toolBase: 'inventory_locations',
    description: 'Warehouses / stores / bins where stock is held.' },
  { vertical: 'inventory', path: 'stock-levels', toolBase: 'stock_levels',
    description: 'Stock-on-hand per (location, product).' },
  { vertical: 'inventory', path: 'stock-adjustments', toolBase: 'stock_adjustments',
    description: 'Manual or system-generated stock adjustments (counts, write-offs, corrections).' },
  { vertical: 'inventory', path: 'stock-transfers', toolBase: 'stock_transfers',
    description: 'Movements of stock between locations.' },
  { vertical: 'inventory', path: 'purchase-orders', toolBase: 'inventory_purchase_orders',
    description: 'Purchase orders raised against suppliers to replenish stock.' },
  { vertical: 'inventory', path: 'suppliers', toolBase: 'suppliers',
    description: 'Suppliers / vendors that fulfill purchase orders.' },
]
