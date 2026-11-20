---
inclusion: always
---

# Legacy behaviour of Shifa Medical Store

This code replaces a DOS app whose source is lost. These rules were observed in the old app (Soul version 1). Keep them exactly, including the odd ones: the shop depends on them. Change one only after a recorded keep-or-fix decision.

- `discount-over-5000`: A bill whose subtotal is over Rs 5,000 gets 10% off, truncated to the paisa. Exactly Rs 5,000 gets no discount. (`if bill.subtotal > 5000 then trunc(bill.subtotal * 0.10, 2) else 0`)
- `gst-17-truncated`: GST is 17% of the bill after discount, truncated (not rounded) to the paisa. (`trunc((bill.subtotal - bill.discount) * 0.17, 2)`)
- `bill-total`: The total is the subtotal less the discount, plus GST. (`bill.subtotal - bill.discount + bill.gst`)
- `expired-batch-blocked`: A medicine whose batch has expired cannot be added to a bill. A batch that expires today can. (`medicine.expiry >= today`)
- `qty-over-stock-refused`: A quantity larger than the stock is refused when the item is added. (`item.qty <= medicine.qty`)
- `stock-decrement`: Saving a bill takes the quantity of each item off that medicine's stock. (`medicine.qty - item.qty`)
- `bill-subtotal`: The subtotal is the sum of the lines, each its quantity times its price. (`sum(items, x => x.qty * x.price)`)
- `line-price`: A bill line's price is the medicine's price. (`medicine.price`)
- `line-amount`: A bill line's amount is its quantity times its price. (`item.qty * item.price`)
- `bill-date`: A bill is dated the day it is saved, by the PC's clock. (`today`)

Money is decimal, never floating point. Truncate where a rule truncates.
