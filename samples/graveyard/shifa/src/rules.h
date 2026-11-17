/*
 * Shifa Medical Store business rules. Pure C89 (no DOS calls), so they are unit tested on gcc too.
 * All money is in paisa (Rs 1 = 100) as long. int is 16 bits on DOS.
 */
#ifndef RULES_H
#define RULES_H

#define GST_PERCENT 17L
#define DISCOUNT_PERCENT 10L
#define DISCOUNT_OVER 500000L       /* Rs 5,000.00: the bill must be over this */
#define LINE_MAX_PAISA 999999999L   /* largest amount an N(10,2) field holds */

typedef struct {
    long subtotal;
    long discount;
    long gst;
    long total;
} BILL_TOTALS;

/* price * qty. Sets *err when qty is negative or the amount does not fit N(10,2). */
long rule_line_amount(long price, long qty, int *err);
/* 10% of the subtotal, truncated, when the subtotal is over Rs 5,000. Otherwise 0.
 * LEGACY BUG 3, kept on purpose: subtotal * 10 is a long, so above Rs 21,47,483.64 it wraps around
 * on DOS (32-bit long) and the discount comes out wrong, even negative. */
long rule_discount(long subtotal);
/* 17% of the amount, truncated to the paisa. */
long rule_gst(long taxable);
/* Discount first, then GST on what is left. */
void rule_totals(long subtotal, BILL_TOTALS *t);

/* YYMM-#### from the bill date and the month's counter, e.g. 9807-0001. out holds 10 bytes. */
void rule_bill_no(int year, int month, int seq, char *out);
/* The counter of a bill number if it is from that month, else 0. */
int rule_bill_seq(const char *bill_no, int year, int month);

/* 1 if a batch with this YYYYMMDD expiry may not be sold today. Blank expiry: 0.
 * LEGACY BUG 1, kept on purpose: compares two-digit years. */
int rule_is_expired(const char *expiry, int year, int month, int day);

/* 1 if this quantity may be added to a bill with this much in stock.
 * LEGACY BUG 2, kept on purpose: qty 0 always passes, and the line edit (F3) never checks again. */
int rule_qty_ok_on_entry(long qty, long stock);

#endif
