/*
 * Unit tests for shifa/src/rules.c: the hidden business rules of Shifa Medical Store.
 * SOURCES: shifa/src/rules.c
 * Run on gcc and on 16-bit DOS by toolchain/test.sh. All money is in paisa (Rs 1 = 100).
 */
#include <stdio.h>
#include <string.h>
#include "../src/rules.h"

static int checks = 0;
static int failures = 0;

#define CHECK(cond)                                                \
    do {                                                           \
        checks++;                                                  \
        if (!(cond)) {                                             \
            failures++;                                            \
            printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond); \
        }                                                          \
    } while (0)

static void test_gst(void)
{
    /* 17% GST, truncated (not rounded) to the paisa. */
    CHECK(rule_gst(8750L) == 1487L); /* 1487.5: rounding would give 1488 */
    CHECK(rule_gst(500000L) == 85000L);
    CHECK(rule_gst(0L) == 0L);
    CHECK(rule_gst(1L) == 0L);
    CHECK(rule_gst(99L) == 16L);
    CHECK(rule_gst(100L) == 17L);
    CHECK(rule_gst(1400L) == 238L);
    /* No overflow at the largest bill: 999,999,999 * 17 does not fit in 32 bits. */
    CHECK(rule_gst(999999999L) == 169999999L);
}

static void test_discount(void)
{
    /* 10% off when the subtotal is over Rs 5,000. Exactly Rs 5,000 gets no discount. */
    CHECK(rule_discount(500000L) == 0L);
    CHECK(rule_discount(499999L) == 0L);
    CHECK(rule_discount(500001L) == 50000L); /* 50000.1, truncated */
    CHECK(rule_discount(520000L) == 52000L);
    CHECK(rule_discount(0L) == 0L);
}

static void test_legacy_bug_discount_overflow(void)
{
    BILL_TOTALS t;
    /* LEGACY BUG 3, kept on purpose: subtotal * 10 is done in a long. On DOS a long is 32 bits,
     * so above Rs 21,47,483.64 it wraps around. INS100 at qty 9,999 (reached through bug 2):
     * subtotal 649,935,000 * 10 wraps to -2,090,584,592, and the discount is -20,905,845.
     * gcc on 64-bit Linux has a 64-bit long, which does not overflow: there the discount is
     * correct, so these checks only pin the bug where long is 32 bits (the real DOS build). */
    if (sizeof(long) == 4) {
        CHECK(rule_discount(214748364L) == 21474836L); /* largest subtotal that does not wrap */
        CHECK(rule_discount(214748365L) < 0L);         /* the first one that does */
        CHECK(rule_discount(649935000L) == -20905845L);
        rule_totals(649935000L, &t);
        CHECK(t.discount == -20905845L && t.gst == 114042943L && t.total == 784883788L);
    } else {
        CHECK(rule_discount(649935000L) == 64993500L);
        rule_totals(649935000L, &t);
        CHECK(t.total == 684381555L);
    }
}

static void test_totals(void)
{
    BILL_TOTALS t;
    rule_totals(8750L, &t);
    CHECK(t.subtotal == 8750L && t.discount == 0L && t.gst == 1487L && t.total == 10237L);
    /* Discount first, then GST on what is left. */
    rule_totals(520000L, &t);
    CHECK(t.discount == 52000L && t.gst == 79560L && t.total == 547560L);
    rule_totals(500000L, &t);
    CHECK(t.discount == 0L && t.gst == 85000L && t.total == 585000L);
}

static void test_line_amount(void)
{
    int err = 0;
    CHECK(rule_line_amount(1250L, 4L, &err) == 5000L && err == 0);
    CHECK(rule_line_amount(65000L, 8L, &err) == 520000L && err == 0);
    CHECK(rule_line_amount(0L, 0L, &err) == 0L && err == 0);
    rule_line_amount(999999999L, 2L, &err);
    CHECK(err != 0); /* does not fit N(10,2) */
    err = 0;
    rule_line_amount(1250L, -1L, &err);
    CHECK(err != 0);
}

static void test_bill_no(void)
{
    char no[10];
    rule_bill_no(1998, 7, 1, no);
    CHECK(strcmp(no, "9807-0001") == 0);
    rule_bill_no(2000, 1, 12, no);
    CHECK(strcmp(no, "0001-0012") == 0);
    rule_bill_no(1999, 12, 9999, no);
    CHECK(strcmp(no, "9912-9999") == 0);
    /* The counter restarts every month. */
    CHECK(rule_bill_seq("9807-0042", 1998, 7) == 42);
    CHECK(rule_bill_seq("9806-0003", 1998, 7) == 0);
    CHECK(rule_bill_seq("0001-0001", 2000, 1) == 1);
    CHECK(rule_bill_seq("", 1998, 7) == 0);
}

static void test_expiry(void)
{
    CHECK(rule_is_expired("19980630", 1998, 7, 15) == 1);
    CHECK(rule_is_expired("19980714", 1998, 7, 15) == 1);
    CHECK(rule_is_expired("19980715", 1998, 7, 15) == 0); /* expires today: still sold */
    CHECK(rule_is_expired("19991231", 1998, 7, 15) == 0);
    CHECK(rule_is_expired("", 1998, 7, 15) == 0);
    CHECK(rule_is_expired("        ", 1998, 7, 15) == 0);
}

static void test_legacy_bug_two_digit_year(void)
{
    /* LEGACY BUG 1, kept on purpose: the expiry check compares two-digit years (Y2K). */
    /* A batch good until June 2000 is blocked as expired in 1998 (00 < 98). */
    CHECK(rule_is_expired("20000630", 1998, 7, 15) == 1);
    /* A batch that expired in June 1998 is sold in January 2000 (98 > 00). */
    CHECK(rule_is_expired("19980630", 2000, 1, 15) == 0);
}

static void test_legacy_bug_zero_qty(void)
{
    CHECK(rule_qty_ok_on_entry(3L, 3L) == 1);
    CHECK(rule_qty_ok_on_entry(4L, 3L) == 0);
    CHECK(rule_qty_ok_on_entry(1L, 0L) == 0);
    CHECK(rule_qty_ok_on_entry(-1L, 3L) == 0);
    /* LEGACY BUG 2, kept on purpose: qty 0 passes the stock check, and editing the line later
     * (F3) never checks stock again, so a bill can take stock below zero. */
    CHECK(rule_qty_ok_on_entry(0L, 3L) == 1);
    CHECK(rule_qty_ok_on_entry(0L, 0L) == 1);
}

int main(void)
{
    test_gst();
    test_discount();
    test_totals();
    test_line_amount();
    test_bill_no();
    test_expiry();
    test_legacy_bug_two_digit_year();
    test_legacy_bug_zero_qty();
    test_legacy_bug_discount_overflow();
    if (failures) {
        printf("%d OF %d CHECKS FAILED\n", failures, checks);
        return 1;
    }
    printf("ALL %d CHECKS PASSED\n", checks);
    return 0;
}
