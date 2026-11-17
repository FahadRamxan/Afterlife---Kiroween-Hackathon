/* See rules.h. */
#include <stdio.h>
#include <string.h>
#include "rules.h"

long rule_line_amount(long price, long qty, int *err)
{
    if (qty < 0L || price < 0L || (qty > 0L && price > LINE_MAX_PAISA / qty)) {
        *err = 1;
        return 0L;
    }
    return price * qty;
}

long rule_discount(long subtotal)
{
    return subtotal > DISCOUNT_OVER ? subtotal * DISCOUNT_PERCENT / 100L : 0L;
}

long rule_gst(long taxable)
{
    /* taxable * 17 / 100 overflows 32 bits above about Rs 1.26 crore, so split rupees and paisa:
     * trunc((100q + r) * 17 / 100) = 17q + trunc(17r / 100). */
    return (taxable / 100L) * GST_PERCENT + ((taxable % 100L) * GST_PERCENT) / 100L;
}

void rule_totals(long subtotal, BILL_TOTALS *t)
{
    t->subtotal = subtotal;
    t->discount = rule_discount(subtotal);
    t->gst = rule_gst(subtotal - t->discount);
    t->total = subtotal - t->discount + t->gst;
}

void rule_bill_no(int year, int month, int seq, char *out)
{
    sprintf(out, "%02d%02d-%04d", year % 100, month, seq);
}

static int two_digits(const char *s)
{
    if (s[0] < '0' || s[0] > '9' || s[1] < '0' || s[1] > '9') return -1;
    return (s[0] - '0') * 10 + (s[1] - '0');
}

int rule_bill_seq(const char *bill_no, int year, int month)
{
    int seq = 0;
    int i;
    if (strlen(bill_no) != 9 || bill_no[4] != '-') return 0;
    if (two_digits(bill_no) != year % 100 || two_digits(bill_no + 2) != month) return 0;
    for (i = 5; i < 9; i++) {
        if (bill_no[i] < '0' || bill_no[i] > '9') return 0;
        seq = seq * 10 + (bill_no[i] - '0');
    }
    return seq;
}

int rule_is_expired(const char *expiry, int year, int month, int day)
{
    int yy, mm, dd;
    if (strlen(expiry) < 8) return 0;
    /* LEGACY BUG 1: only the last two digits of the year are compared ("98", not "1998"). */
    yy = two_digits(expiry + 2);
    mm = two_digits(expiry + 4);
    dd = two_digits(expiry + 6);
    if (yy < 0 || mm < 0 || dd < 0) return 0;
    return (long)yy * 10000L + (long)mm * 100L + dd <
           (long)(year % 100) * 10000L + (long)month * 100L + day;
}

int rule_qty_ok_on_entry(long qty, long stock)
{
    if (qty < 0L) return 0;
    /* LEGACY BUG 2: "nothing to check" for 0, so the line is added without a stock check. */
    if (qty == 0L) return 1;
    return qty <= stock;
}
