# Requirements

The reborn Shifa Medical Store must behave exactly as the old one. Each requirement below is one rule the old app follows, from Soul version 1.

### Requirement 1: `discount-over-5000`

**User story:** As the owner of Shifa Medical Store, I want the reborn app to keep this rule of the old one, so that my records come out the same.

**Rule:** A bill whose subtotal is over Rs 5,000 gets 10% off, truncated to the paisa. Exactly Rs 5,000 gets no discount.

**Evidence:** none yet. **Confidence:** 100%.

#### Acceptance criteria

1.1. WHEN the bill subtotal is over 5000 THE SYSTEM SHALL set the bill discount to `trunc(bill.subtotal * 0.10, 2)`.
1.2. WHEN the bill subtotal is at most 5000 THE SYSTEM SHALL set the bill discount to `0`.

### Requirement 2: `gst-17-truncated`

**User story:** As the owner of Shifa Medical Store, I want the reborn app to keep this rule of the old one, so that my records come out the same.

**Rule:** GST is 17% of the bill after discount, truncated (not rounded) to the paisa.

**Evidence:** none yet. **Confidence:** 100%.

#### Acceptance criteria

2.1. THE SYSTEM SHALL set the bill gst to `trunc((bill.subtotal - bill.discount) * 0.17, 2)`.

### Requirement 3: `bill-total`

**User story:** As the owner of Shifa Medical Store, I want the reborn app to keep this rule of the old one, so that my records come out the same.

**Rule:** The total is the subtotal less the discount, plus GST.

**Evidence:** none yet. **Confidence:** 100%.

#### Acceptance criteria

3.1. THE SYSTEM SHALL set the bill total to `bill.subtotal - bill.discount + bill.gst`.

### Requirement 4: `expired-batch-blocked`

**User story:** As the owner of Shifa Medical Store, I want the reborn app to keep this rule of the old one, so that my records come out the same.

**Rule:** A medicine whose batch has expired cannot be added to a bill. A batch that expires today can.

**Evidence:** none yet. **Confidence:** 100%.

#### Acceptance criteria

4.1. IF the medicine expiry is before today THEN THE SYSTEM SHALL refuse the entry and leave the data unchanged.

### Requirement 5: `qty-over-stock-refused`

**User story:** As the owner of Shifa Medical Store, I want the reborn app to keep this rule of the old one, so that my records come out the same.

**Rule:** A quantity larger than the stock is refused when the item is added.

**Evidence:** none yet. **Confidence:** 100%.

#### Acceptance criteria

5.1. IF the item qty is over the medicine qty THEN THE SYSTEM SHALL refuse the entry and leave the data unchanged.

### Requirement 6: `stock-decrement`

**User story:** As the owner of Shifa Medical Store, I want the reborn app to keep this rule of the old one, so that my records come out the same.

**Rule:** Saving a bill takes the quantity of each item off that medicine's stock.

**Evidence:** none yet. **Confidence:** 100%.

#### Acceptance criteria

6.1. WHEN "Save a bill" is done THE SYSTEM SHALL set the medicine qty to `medicine.qty - item.qty`.

### Requirement 7: `bill-subtotal`

**User story:** As the owner of Shifa Medical Store, I want the reborn app to keep this rule of the old one, so that my records come out the same.

**Rule:** The subtotal is the sum of the lines, each its quantity times its price.

**Evidence:** none yet. **Confidence:** 100%.

#### Acceptance criteria

7.1. THE SYSTEM SHALL set the bill subtotal to `sum(items, x => x.qty * x.price)`.
