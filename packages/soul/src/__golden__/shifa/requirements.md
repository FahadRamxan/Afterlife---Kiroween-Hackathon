# Requirements Document

## Introduction

The reborn Shifa Medical Store must behave exactly as the old one. Each requirement below is one rule the old app follows, from Soul version 1.

## Glossary

- **System**: the reborn Shifa Medical Store, built from this spec.
- **Old app**: the DOS program this spec replaces. Its source is lost.
- **Soul**: Afterlife's record of the old app (version 1): its data files, screens, actions and rules.
- **Medicine**: a record in `MEDICINE.DBF`.
- **Customer**: a record in `CUSTOMER.DBF`.
- **Bill**: a record in `BILLS.DBF`.
- **Bill line**: a record in `BILLITEM.DBF`.
- **Evidence**: the recorded observations of the old app that show a rule.
- **Confidence**: how sure the Soul is of a rule, from its evidence.

## Requirements

### Requirement 1: `discount-over-5000`

**User Story:** As the owner of Shifa Medical Store, I want the reborn app to keep this rule of the old one, so that my records come out the same.

**Rule:** A bill whose subtotal is over Rs 5,000 gets 10% off, truncated to the paisa. Exactly Rs 5,000 gets no discount.

**Evidence:** none yet. **Confidence:** 100%.

#### Acceptance Criteria

1. WHEN the bill subtotal is over 5000 THE SYSTEM SHALL set the bill discount to `trunc(bill.subtotal * 0.10, 2)`.
2. WHEN the bill subtotal is at most 5000 THE SYSTEM SHALL set the bill discount to `0`.

### Requirement 2: `gst-17-truncated`

**User Story:** As the owner of Shifa Medical Store, I want the reborn app to keep this rule of the old one, so that my records come out the same.

**Rule:** GST is 17% of the bill after discount, truncated (not rounded) to the paisa.

**Evidence:** none yet. **Confidence:** 100%.

#### Acceptance Criteria

1. THE SYSTEM SHALL set the bill gst to `trunc((bill.subtotal - bill.discount) * 0.17, 2)`.

### Requirement 3: `bill-total`

**User Story:** As the owner of Shifa Medical Store, I want the reborn app to keep this rule of the old one, so that my records come out the same.

**Rule:** The total is the subtotal less the discount, plus GST.

**Evidence:** none yet. **Confidence:** 100%.

#### Acceptance Criteria

1. THE SYSTEM SHALL set the bill total to `bill.subtotal - bill.discount + bill.gst`.

### Requirement 4: `expired-batch-blocked`

**User Story:** As the owner of Shifa Medical Store, I want the reborn app to keep this rule of the old one, so that my records come out the same.

**Rule:** A medicine whose batch has expired cannot be added to a bill. A batch that expires today can.

**Evidence:** none yet. **Confidence:** 100%.

#### Acceptance Criteria

1. IF the medicine expiry is before today THEN THE SYSTEM SHALL refuse the entry and leave the data unchanged.

### Requirement 5: `qty-over-stock-refused`

**User Story:** As the owner of Shifa Medical Store, I want the reborn app to keep this rule of the old one, so that my records come out the same.

**Rule:** A quantity larger than the stock is refused when the item is added.

**Evidence:** none yet. **Confidence:** 100%.

#### Acceptance Criteria

1. IF the item qty is over the medicine qty THEN THE SYSTEM SHALL refuse the entry and leave the data unchanged.

### Requirement 6: `stock-decrement`

**User Story:** As the owner of Shifa Medical Store, I want the reborn app to keep this rule of the old one, so that my records come out the same.

**Rule:** Saving a bill takes the quantity of each item off that medicine's stock.

**Evidence:** none yet. **Confidence:** 100%.

#### Acceptance Criteria

1. WHEN "Save a bill" is done THE SYSTEM SHALL set the medicine qty to `medicine.qty - item.qty`.

### Requirement 7: `bill-subtotal`

**User Story:** As the owner of Shifa Medical Store, I want the reborn app to keep this rule of the old one, so that my records come out the same.

**Rule:** The subtotal is the sum of the lines, each its quantity times its price.

**Evidence:** none yet. **Confidence:** 100%.

#### Acceptance Criteria

1. THE SYSTEM SHALL set the bill subtotal to `sum(items, x => x.qty * x.price)`.
