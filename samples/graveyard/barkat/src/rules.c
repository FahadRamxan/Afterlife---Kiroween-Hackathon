/* See rules.h. */
#include <stdio.h>
#include <string.h>
#include "rules.h"

long bk_parse_amount(const char *s)
{
    long v = 0L;
    int decimals = -1;
    int digits = 0;
    for (; *s; s++) {
        if (*s == '.') {
            if (decimals >= 0) return -1L;
            decimals = 0;
        } else if (*s >= '0' && *s <= '9') {
            if (decimals >= 2) return -1L;
            if (v > MAX_ENTRY) return -1L;
            v = v * 10L + (long)(*s - '0');
            digits++;
            if (decimals >= 0) decimals++;
        } else {
            return -1L;
        }
    }
    if (digits == 0) return -1L;
    for (; decimals < 2; decimals = decimals < 0 ? 1 : decimals + 1) v *= 10L;
    if (v <= 0L || v > MAX_ENTRY) return -1L;
    return v;
}

long bk_apply(long balance, char kind, long amount)
{
    return kind == 'P' ? balance - amount : balance + amount;
}

int bk_sale_ok(long balance, long amount, long limit)
{
    return balance + amount <= limit;
}

int bk_payment_ok(long balance, long amount)
{
    return amount <= balance;
}

int bk_needs_reminder(long balance, const char *last_pay, int year, int month)
{
    char first[9];
    if (balance <= 0L) return 0;
    if (strlen(last_pay) < 8) return 1;
    sprintf(first, "%04d%02d01", year, month);
    return strcmp(last_pay, first) < 0;
}

void bk_balance_field(long balance, char *out)
{
    unsigned long mag = balance < 0L ? 0UL - (unsigned long)balance : (unsigned long)balance;
    char tmp[24];
    int n = sprintf(tmp, "%s%lu.%02lu", balance < 0L ? "-" : "", mag / 100UL, mag % 100UL);
    if (n > BALANCE_WIDTH) {
        /* LEGACY BUG: does not fit N(8,2), so it is written as stars, like dBASE does. */
        memset(out, '*', BALANCE_WIDTH);
        out[BALANCE_WIDTH] = '\0';
        return;
    }
    sprintf(out, "%*s", BALANCE_WIDTH, tmp);
}

long bk_read_balance(const char *field)
{
    long v = 0L;
    int decimals = -1;
    int negative = 0;
    for (; *field; field++) {
        if (*field == '-') negative = 1;
        else if (*field == '.') decimals = 0;
        else if (*field >= '0' && *field <= '9') {
            v = v * 10L + (long)(*field - '0');
            if (decimals >= 0) decimals++;
        }
    }
    for (; decimals < 2; decimals = decimals < 0 ? 1 : decimals + 1) v *= 10L;
    return negative ? -v : v;
}
