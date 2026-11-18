/**
 * What the payments sandbox serves.
 *
 * Payments is the vertical that exercises actions hardest: where docsign
 * declares a single action verb, payments has seven, across five resources,
 * in three different shapes:
 *
 *  - **Plain state transitions** — `cancelCharge(credentials, id)`, no body.
 *  - **Transitions that take a body** — `captureCharge(credentials, id, {
 *    amount })`, `cancelSubscription(credentials, id, { atPeriodEnd })`,
 *    `submitDisputeEvidence(credentials, id, evidence)`.
 *  - **A detach that is really a delete** — `detachPaymentMethod` returns
 *    `void` and is bound to `DELETE /payment_methods/:id`, so it is declared
 *    in the `delete` slot rather than as an action. The verb the route uses
 *    is what decides this, not the method's name.
 *
 * Every `sets` value below comes from the vertical's own status enum — the
 * spellings are not uniform. A cancelled charge and a cancelled subscription
 * are both `'cancelled'` (two Ls), a voided invoice is `'void'` and not
 * `'voided'` as it is in docsign, and a dispute under review is
 * `'under_review'`. Getting one wrong writes a value the schema rejects, and
 * the sweep validates every action response against its schema.
 *
 * `invoice_line_items` is a child addressed by a PATH segment —
 * `GET /invoices/{id}/line_items`. Docsign's children filter a collection
 * that exists on its own (`/signers?envelope_id=`); there is no
 * `/line_items` collection here at all. The adapter cannot tell the two
 * apart, since both arrive as `list*(credentials, parentId, params)`.
 *
 * Imports schemas from `../schema` and NOTHING else from the vertical:
 * `../index` would pull in `adapter/factories.ts` and its adapter clients,
 * which `check:sandbox-egress` rejects — correctly, since it would end the
 * sandbox's no-egress property.
 */
import type { SandboxResourceSpec } from '../../../sandbox/resource-spec'
import {
  BalanceTransactionSchema,
  ChargeSchema,
  CustomerSchema,
  DisputeSchema,
  InvoiceLineItemSchema,
  InvoiceSchema,
  PaymentMethodSchema,
  PayoutSchema,
  PlanSchema,
  PriceSchema,
  ProductSchema,
  RefundSchema,
  SubscriptionSchema,
} from '../schema'

export const SANDBOX_RESOURCES: SandboxResourceSpec[] = [
  {
    resourceType: 'customers',
    schema: CustomerSchema,
    list: 'listCustomers',
    get: 'getCustomer',
    create: 'createCustomer',
    update: 'updateCustomer',
    delete: 'deleteCustomer',
    seed: 3,
  },
  {
    // `detachPaymentMethod` returns void and is bound to DELETE, so it is a
    // delete in everything but name — detaching a card from an account is
    // exactly "this id stops resolving here". Declaring it as an action
    // instead would leave DELETE answering 501 while the action route it
    // would have created does not exist.
    resourceType: 'payment_methods',
    schema: PaymentMethodSchema,
    list: 'listPaymentMethods',
    get: 'getPaymentMethod',
    delete: 'detachPaymentMethod',
    seed: 3,
  },
  {
    resourceType: 'charges',
    schema: ChargeSchema,
    list: 'listCharges',
    get: 'getCharge',
    create: 'createCharge',
    actions: {
      capture: { method: 'captureCharge', sets: { status: 'succeeded' } },
      cancel: { method: 'cancelCharge', sets: { status: 'cancelled' } },
    },
    seed: 3,
  },
  {
    resourceType: 'refunds',
    schema: RefundSchema,
    list: 'listRefunds',
    get: 'getRefund',
    create: 'createRefund',
    seed: 3,
  },
  {
    resourceType: 'subscriptions',
    schema: SubscriptionSchema,
    list: 'listSubscriptions',
    get: 'getSubscription',
    create: 'createSubscription',
    update: 'updateSubscription',
    actions: {
      cancel: { method: 'cancelSubscription', sets: { status: 'cancelled' } },
    },
    seed: 3,
  },
  {
    resourceType: 'invoices',
    schema: InvoiceSchema,
    list: 'listInvoices',
    get: 'getInvoice',
    create: 'createInvoice',
    update: 'updateInvoice',
    actions: {
      // `'void'`, not `'voided'` — payments and docsign spell the same
      // transition differently, and this one comes from InvoiceStatusSchema.
      void: { method: 'voidInvoice', sets: { status: 'void' } },
      pay: { method: 'payInvoice', sets: { status: 'paid' } },
    },
    seed: 3,
  },
  {
    // No collection of its own: the only route is GET /invoices/{id}/line_items,
    // and the interface declares no getter, so a single line item is not
    // addressable. Both facts are the live surface's, not the sandbox's.
    resourceType: 'invoice_line_items',
    schema: InvoiceLineItemSchema,
    list: 'listInvoiceLineItems',
    parent: {
      resourceType: 'invoices',
      // Counting args after `credentials`: (invoiceId, params) → invoiceId is 0.
      argIndex: 0,
      foreignKey: 'invoiceId',
      pathSegment: 'line_items',
    },
    seed: 2,
  },
  {
    resourceType: 'payouts',
    schema: PayoutSchema,
    list: 'listPayouts',
    get: 'getPayout',
    seed: 3,
  },
  {
    resourceType: 'disputes',
    schema: DisputeSchema,
    list: 'listDisputes',
    get: 'getDispute',
    actions: {
      evidence: { method: 'submitDisputeEvidence', sets: { status: 'under_review' } },
    },
    seed: 3,
  },
  // Plans, prices and products are three resources served by one router file
  // (`router/plans.ts`), each with its own `resourceType` string passed
  // inline rather than a shared RESOURCE constant. Read-only on the
  // interface: catalogue configuration is managed in the gateway's dashboard.
  {
    resourceType: 'plans',
    schema: PlanSchema,
    list: 'listPlans',
    get: 'getPlan',
    seed: 2,
  },
  {
    resourceType: 'prices',
    schema: PriceSchema,
    list: 'listPrices',
    get: 'getPrice',
    seed: 2,
  },
  {
    resourceType: 'products',
    schema: ProductSchema,
    list: 'listProducts',
    get: 'getProduct',
    seed: 2,
  },
  {
    resourceType: 'balance_transactions',
    schema: BalanceTransactionSchema,
    list: 'listBalanceTransactions',
    get: 'getBalanceTransaction',
    seed: 3,
  },
]
