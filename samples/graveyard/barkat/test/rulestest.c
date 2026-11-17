/*
 * Unit tests for barkat/src/rules.c: the hidden rules of Barkat Kiryana Ledger (1996).
 * SOURCES: barkat/src/rules.c
 * Money is in paisa (Rs 1 = 100).
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

static void test_parse_amount(void)
{
    CHECK(bk_parse_amount("450") == 45000L);
    CHECK(bk_parse_amount("450.5") == 45050L);
    CHECK(bk_parse_amount("450.50") == 45050L);
    CHECK(bk_parse_amount("0.75") == 75L);
    CHECK(bk_parse_amount("99999.99") == 9999999L);
    CHECK(bk_parse_amount("") == -1L);
    CHECK(bk_parse_amount("0") == -1L); /* must be more than zero */
    CHECK(bk_parse_amount("0.00") == -1L);
    CHECK(bk_parse_amount("12.345") == -1L);
    CHECK(bk_parse_amount("1.2.3") == -1L);
    CHECK(bk_parse_amount(".") == -1L);
    CHECK(bk_parse_amount("100000.00") == -1L); /* more than one entry can hold */
}

static void test_running_balance(void)
{
    CHECK(bk_apply(1000000L, 'S', 45000L) == 1045000L); /* sale on credit adds */
    CHECK(bk_apply(1000000L, 'P', 45000L) == 955000L);  /* payment subtracts */
    CHECK(bk_apply(0L, 'S', 1L) == 1L);
}

static void test_credit_limit(void)
{
    CHECK(bk_sale_ok(1500000L, 500000L, 2000000L) == 1);  /* exactly the limit */
    CHECK(bk_sale_ok(1500000L, 500001L, 2000000L) == 0);  /* one paisa over */
    CHECK(bk_sale_ok(0L, 2000001L, 2000000L) == 0);
    CHECK(bk_payment_ok(500000L, 500000L) == 1);
    CHECK(bk_payment_ok(500000L, 500001L) == 0);          /* no advance payments */
}

static void test_reminders(void)
{
    /* November 1996: balance due and no payment since 1 November. Interest-free: only a reminder. */
    CHECK(bk_needs_reminder(120000L, "19961028", 1996, 11) == 1);
    CHECK(bk_needs_reminder(120000L, "", 1996, 11) == 1);
    CHECK(bk_needs_reminder(120000L, "19961101", 1996, 11) == 0);
    CHECK(bk_needs_reminder(120000L, "19961119", 1996, 11) == 0);
    CHECK(bk_needs_reminder(0L, "19960901", 1996, 11) == 0);
}

static void test_balance_field(void)
{
    char out[9];
    bk_balance_field(9850000L, out);
    CHECK(strcmp(out, "98500.00") == 0);
    bk_balance_field(9999999L, out);
    CHECK(strcmp(out, "99999.99") == 0);
    bk_balance_field(45050L, out);
    CHECK(strcmp(out, "  450.50") == 0);
    bk_balance_field(0L, out);
    CHECK(strcmp(out, "    0.00") == 0);
}

static void test_legacy_bug_overflow(void)
{
    /* LEGACY BUG, kept on purpose: BALANCE is N(8,2), so it holds at most 99999.99. A larger value
     * is written as ******** (as dBASE's STR() does), and ******** reads back as 0. */
    char out[9];
    bk_balance_field(10050000L, out);
    CHECK(strcmp(out, "********") == 0);
    CHECK(bk_read_balance("********") == 0L);
    CHECK(bk_read_balance("98500.00") == 9850000L);
    CHECK(bk_read_balance("  450.50") == 45050L);
    /* So a party past Rs 99,999.99 drops to 0, and the next sale starts from nothing. */
    bk_balance_field(bk_apply(9850000L, 'S', 200000L), out);
    CHECK(bk_apply(bk_read_balance(out), 'S', 50000L) == 50000L);
}

int main(void)
{
    test_parse_amount();
    test_running_balance();
    test_credit_limit();
    test_reminders();
    test_balance_field();
    test_legacy_bug_overflow();
    if (failures) {
        printf("%d OF %d CHECKS FAILED\n", failures, checks);
        return 1;
    }
    printf("ALL %d CHECKS PASSED\n", checks);
    return 0;
}
