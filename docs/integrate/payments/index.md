---
vertical: payments
title: Payments
last_verified: 2026-06-14
written_by: claude
---

# Payments (`payments`)

Unified read surface across payment gateways, processors, and PSPs. 159 adapters. Reference adapter: [`stripe`](./stripe.md).

## Canonical schema

| Resource | Purpose |
|---|---|
| `Customer` | Gateway customer records (the buyer/payer the gateway tracks). |
| `PaymentMethod` | Saved payment methods — cards, bank accounts, wallets, mandates. |
| `Charge` | Charge / payment-intent records with refund and dispute references. |
| `Refund` | Refunds issued against charges. |
| `Subscription` | Recurring-billing subscriptions and their items, periods, and dunning state. |
| `Invoice` | Gateway invoices (subscription-generated and standalone). |
| `Payout` | Gateway-to-bank settlements. |
| `Dispute` | Chargebacks / disputes and their evidence-submission deadlines. |
| `Plan` | Subscription plans (Tier-2; not every gateway exposes Plan as a record). |
| `Price` | Prices for products (Tier-2). |
| `Product` | Products that are sold under one or more prices (Tier-2). |
| `BalanceTransaction` | Ledger of every balance-affecting event: charges, refunds, payouts, fees, adjustments. |

## Endpoints

| Verb | Path | Notes |
|---|---|---|
| GET | `/v1/payments/customers` | Gateway customers. |
| GET | `/v1/payments/payment_methods` | Saved instruments. |
| GET | `/v1/payments/charges` | Charges / payment intents. |
| GET | `/v1/payments/refunds` | Refunds. |
| GET | `/v1/payments/subscriptions` | Recurring-billing rows. |
| GET | `/v1/payments/invoices` | Gateway invoices. |
| GET | `/v1/payments/payouts` | Settlements. |
| GET | `/v1/payments/disputes` | Chargebacks. |
| GET | `/v1/payments/plans` | Subscription plans. |
| GET | `/v1/payments/prices` | Catalog prices. |
| GET | `/v1/payments/products` | Catalog products. |
| GET | `/v1/payments/balance_transactions` | Ledger. |

## Refused at the schema level

- Raw card numbers and full BIN data
- Dispute evidence file uploads
- KYC / merchant onboarding document content
- 3-D Secure challenge UI internals

## Authentication

Tenant mode (`Authorization: Bearer os_…`). Each `/v1/payments/*` request requires `connection_id`. Most processors use API key or OAuth 2.0. Adyen and GoCardless use HMAC only to verify webhooks, not to authenticate requests. See [`docs/dev-api.md`](../../dev-api.md).
