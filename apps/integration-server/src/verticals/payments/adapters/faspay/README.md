# Faspay Payments Adapter

Indonesian payment gateway (Faspay Business / Online-Debit).

## Authentication

Faspay uses a per-request HMAC-style signature instead of token headers:

```
signature = sha1(md5(user_id + password + bill_no))
```

Credentials supplied via the Connect Link custom form: `merchant_id`, `user_id`, `password`, `environment`.

## Resources implemented

| Resource | Operations |
|---|---|
| Charges | create (Post Data), get (Inquiry), cancel (Cancel/Billing) |

## Resources NOT implemented

### Refunds

Faspay has no first-class refund resource and no dedicated refund endpoint. A reversal is represented by `payment_status_code = 4` on the original transaction object (a "refunded" charge). Because there is no separate refund entity to fetch, list, or create, `transform/refund.ts` is intentionally absent and refund methods are not wired into this adapter.

Reference: https://docs.faspay.co.id/merchant-integration/api-reference-1/debit-transaction

### Customers / listCharges / listRefunds

Faspay has no customer resource and no list/collection endpoints. Transactions are addressed individually by `trx_id` + `bill_no`.

## Money

All amounts are whole-rupiah IDR integers (Faspay's native unit equals the canonical minor-unit for IDR).
