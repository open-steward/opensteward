# 2C2P adapter

**Platform:** 2C2P Payment Gateway (Southeast Asia — Thailand, Singapore, Malaysia, Indonesia, Philippines, Vietnam, Hong Kong)

**Auth model:** Merchant key pair (merchantID + secretKey). No OAuth. Each request is signed as a JWS (HS256) using the secret key. The same key verifies backend-notification JWS payloads.

## Implemented resources

| Resource | Methods | Notes |
|---|---|---|
| Charges | `getCharge`, `listCharges` | Backed by the Payment Inquiry endpoint (`/payment/4.3/paymentInquiry`). `id` = merchant `invoiceNo`. No global list endpoint exists — `listCharges` returns a single-element array when `invoiceNo`/`id` param supplied, `[]` otherwise. |

## Unsupported resources

### Refunds

2C2P refunds run through the **Payment Action** channel, which uses a separate JWE+JWS (RSA) flow requiring a merchant X.509 key pair. This is a fundamentally different credential type from the `merchantID` + `secretKey` pair used by this adapter. Implementing refunds would require a second credential set (RSA private key + certificate) and a distinct signing pipeline.

Refunds are not implemented under the merchant-key (`api_key`) credential flow: no refund method is wired in `index.ts`, so no `transform/refund.ts` exists.

### All other resources (customers, payment methods, subscriptions, invoices, payouts, disputes, plans, prices, products, balance transactions)

2C2P's REST model is transaction-centric. There are no standalone endpoints for these resources accessible with a merchant key pair alone.

## API references

- Payment Inquiry: https://developer.2c2p.com/docs/api-payment-inquiry
- Payment Action (refunds — RSA flow): https://developer.2c2p.com/docs/api-payment-action
- Response codes: https://developer.2c2p.com/docs/response-code-payment
