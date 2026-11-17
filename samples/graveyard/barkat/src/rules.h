/*
 * Barkat Kiryana Ledger rules. Pure C89 (no DOS calls), unit tested on gcc and DOS.
 * Money is in paisa (Rs 1 = 100) as long.
 */
#ifndef RULES_H
#define RULES_H

#define BALANCE_WIDTH 8       /* PARTY.BALANCE and LEDGER.BALANCE are N(8,2) */
#define MAX_ENTRY 9999999L    /* the largest amount one entry can hold: 99999.99 */

/* "450", "450.5" or "450.50" -> paisa. -1 if empty, zero, more than 2 decimals or too large. */
long bk_parse_amount(const char *s);
/* Sale ('S') adds to the balance, payment ('P') subtracts. */
long bk_apply(long balance, char kind, long amount);
/* A sale is allowed if the new balance is not over the limit. */
int bk_sale_ok(long balance, long amount, long limit);
/* A payment may not be more than the balance (no advance payments). */
int bk_payment_ok(long balance, long amount);
/* 1 if a party owes money and has not paid since the 1st of this month. Interest-free: the shop
 * only reminds, it never adds interest. last_pay is YYYYMMDD or blank. */
int bk_needs_reminder(long balance, const char *last_pay, int year, int month);

/* The 8-character BALANCE field text, as dBASE's STR(balance, 8, 2) writes it.
 * LEGACY BUG, kept on purpose: a balance over 99999.99 does not fit, so it becomes ********. */
void bk_balance_field(long balance, char *out);
/* Reads a BALANCE field. ******** has no digits, so it reads as 0. */
long bk_read_balance(const char *field);

#endif
