/*
 * Iqra School Fees business rules. Pure C89 (no DOS calls), unit tested on gcc and DOS.
 * Money is in paisa (Rs 1 = 100) as long, because int is 16 bits on DOS.
 */
#ifndef RULES_H
#define RULES_H

#define DUE_DAY 10            /* the fee for a month is due on its 10th */
#define LATE_PER_WEEK 5000L   /* Rs 50 */
#define LATE_CAP 50000L       /* Rs 500 */
#define SIBLING_PERCENT 15L

typedef struct {
    long fee;
    long discount;
    long late;
    long total;
} FEE_TOTALS;

/* Days since 1 January 1970. */
long iq_day_number(int year, int month, int day);
/* 0 = Monday ... 6 = Sunday. */
int iq_weekday(int year, int month, int day);

/* 15% of the fee, truncated, for the second and later children (sib >= 2). */
long iq_sibling_discount(long fee, int sib);

/* Late weeks for paying the fee of fee_year/fee_month on the given date.
 * LEGACY BUG, kept on purpose: counts calendar weeks (Monday to Sunday) between the due date and
 * the payment, not days. */
int iq_late_weeks(int year, int month, int day, int fee_year, int fee_month);
/* What the school meant: one week for every 7 days late, or part of it. Not used by the app. */
int iq_late_weeks_intended(long days_late);
/* Rs 50 per late week, capped at Rs 500. */
long iq_late_fee(int weeks);

void iq_totals(long fee, int sib, int late_weeks, FEE_TOTALS *t);

/* "MMYYYY" -> month and year. Returns 1 if valid (month 1-12, year 1980-2099). */
int iq_parse_month(const char *s, int *year, int *month);

#endif
