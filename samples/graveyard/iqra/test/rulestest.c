/*
 * Unit tests for iqra/src/rules.c: the hidden business rules of Iqra School Fees 1.1 (2001).
 * SOURCES: iqra/src/rules.c
 * Money is in paisa (Rs 1 = 100). Calendar facts used below: 1 Jan 2001 was a Monday,
 * 10 Mar 2001 a Saturday, 1 Jun 2001 a Friday.
 */
#include <stdio.h>
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

static void test_calendar(void)
{
    CHECK(iq_day_number(1970, 1, 1) == 0L);
    CHECK(iq_day_number(2001, 1, 1) == 11323L);
    CHECK(iq_day_number(2001, 3, 1) - iq_day_number(2001, 2, 28) == 1L); /* 2001 is not a leap year */
    CHECK(iq_day_number(2000, 3, 1) - iq_day_number(2000, 2, 28) == 2L); /* 2000 is */
    CHECK(iq_weekday(2001, 1, 1) == 0);  /* Monday */
    CHECK(iq_weekday(2001, 3, 10) == 5); /* Saturday */
    CHECK(iq_weekday(2001, 3, 11) == 6); /* Sunday */
    CHECK(iq_weekday(2001, 6, 1) == 4);  /* Friday */
}

static void test_sibling_discount(void)
{
    CHECK(iq_sibling_discount(150000L, 1) == 0L);
    CHECK(iq_sibling_discount(150000L, 2) == 22500L);
    CHECK(iq_sibling_discount(150000L, 3) == 22500L); /* later children too */
    CHECK(iq_sibling_discount(133333L, 2) == 19999L); /* 19999.95, truncated */
    CHECK(iq_sibling_discount(0L, 2) == 0L);
}

static void test_late_fee_amount(void)
{
    CHECK(iq_late_fee(0) == 0L);
    CHECK(iq_late_fee(1) == 5000L);
    CHECK(iq_late_fee(9) == 45000L);
    CHECK(iq_late_fee(10) == 50000L);
    CHECK(iq_late_fee(11) == 50000L); /* capped at Rs 500 */
    CHECK(iq_late_fee(52) == 50000L);
}

static void test_late_weeks(void)
{
    /* Fee for March 2001 is due on Saturday 10 March. */
    CHECK(iq_late_weeks(2001, 3, 8, 2001, 3) == 0);  /* early */
    CHECK(iq_late_weeks(2001, 3, 10, 2001, 3) == 0); /* on the day */
    CHECK(iq_late_weeks(2001, 3, 12, 2001, 3) == 1); /* Monday, 2 days late */
    CHECK(iq_late_weeks(2001, 3, 19, 2001, 3) == 2); /* Monday, 9 days late */
    CHECK(iq_late_weeks(2001, 6, 1, 2001, 3) == 12); /* 83 days late */
    CHECK(iq_late_fee(iq_late_weeks(2001, 6, 1, 2001, 3)) == 50000L);
    /* December 2000 (due Sunday 10 Dec) paid on Tuesday 2 Jan 2001: across the year end. */
    CHECK(iq_late_weeks(2001, 1, 2, 2000, 12) == 4);
    /* Paying next month's fee early. */
    CHECK(iq_late_weeks(2001, 3, 12, 2001, 4) == 0);
}

static void test_legacy_bug_calendar_weeks(void)
{
    /* LEGACY BUG, kept on purpose: the late fee counts calendar weeks (Monday to Sunday) between
     * the due date and the payment, not days. The school meant "Rs 50 for every 7 days late, or
     * part of it", which is iq_late_weeks_intended. */
    CHECK(iq_late_weeks_intended(1L) == 1);
    CHECK(iq_late_weeks_intended(7L) == 1);
    CHECK(iq_late_weeks_intended(8L) == 2);
    CHECK(iq_late_weeks_intended(0L) == 0);
    /* Sunday 11 March: 1 day late, but still the due date's calendar week, so no late fee. */
    CHECK(iq_late_weeks(2001, 3, 11, 2001, 3) == 0);
    CHECK(iq_late_weeks_intended(1L) == 1);
    /* Sunday 18 March: 8 days late, intended 2 weeks, charged 1. */
    CHECK(iq_late_weeks(2001, 3, 18, 2001, 3) == 1);
    CHECK(iq_late_weeks_intended(8L) == 2);
}

static void test_months(void)
{
    int y = 0, m = 0;
    CHECK(iq_parse_month("032001", &y, &m) == 1 && y == 2001 && m == 3);
    CHECK(iq_parse_month("122000", &y, &m) == 1 && y == 2000 && m == 12);
    CHECK(iq_parse_month("132001", &y, &m) == 0);
    CHECK(iq_parse_month("002001", &y, &m) == 0);
    CHECK(iq_parse_month("03201", &y, &m) == 0);
    CHECK(iq_parse_month("031979", &y, &m) == 0);
    CHECK(iq_parse_month("03200A", &y, &m) == 0);
}

static void test_totals(void)
{
    FEE_TOTALS t;
    iq_totals(150000L, 2, 1, &t);
    CHECK(t.fee == 150000L && t.discount == 22500L && t.late == 5000L && t.total == 132500L);
    /* The late fee is not discounted. */
    iq_totals(150000L, 2, 12, &t);
    CHECK(t.late == 50000L && t.total == 177500L);
    iq_totals(120000L, 1, 0, &t);
    CHECK(t.discount == 0L && t.late == 0L && t.total == 120000L);
}

int main(void)
{
    test_calendar();
    test_sibling_discount();
    test_late_fee_amount();
    test_late_weeks();
    test_legacy_bug_calendar_weeks();
    test_months();
    test_totals();
    if (failures) {
        printf("%d OF %d CHECKS FAILED\n", failures, checks);
        return 1;
    }
    printf("ALL %d CHECKS PASSED\n", checks);
    return 0;
}
