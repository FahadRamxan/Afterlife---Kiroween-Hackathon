/* See rules.h. */
#include <string.h>
#include "rules.h"

long iq_day_number(int year, int month, int day)
{
    /* Civil date to day count (H. Hinnant's algorithm), in long arithmetic. */
    long y = (long)year - (month <= 2 ? 1L : 0L);
    long era = (y >= 0 ? y : y - 399L) / 400L;
    long yoe = y - era * 400L;
    long mp = (long)(month + (month > 2 ? -3 : 9));
    long doy = (153L * mp + 2L) / 5L + (long)day - 1L;
    long doe = yoe * 365L + yoe / 4L - yoe / 100L + doy;
    return era * 146097L + doe - 719468L;
}

int iq_weekday(int year, int month, int day)
{
    /* 1 January 1970 was a Thursday (3 when Monday is 0). */
    return (int)((iq_day_number(year, month, day) + 3L) % 7L);
}

long iq_sibling_discount(long fee, int sib)
{
    return sib >= 2 ? fee * SIBLING_PERCENT / 100L : 0L;
}

static long week_index(long day)
{
    return (day + 3L) / 7L; /* weeks start on Monday */
}

int iq_late_weeks(int year, int month, int day, int fee_year, int fee_month)
{
    long due = iq_day_number(fee_year, fee_month, DUE_DAY);
    long paid = iq_day_number(year, month, day);
    if (paid <= due) return 0;
    /* LEGACY BUG: calendar weeks crossed, not days late divided by 7. */
    return (int)(week_index(paid) - week_index(due));
}

int iq_late_weeks_intended(long days_late)
{
    return days_late <= 0L ? 0 : (int)((days_late + 6L) / 7L);
}

long iq_late_fee(int weeks)
{
    long fee = (long)weeks * LATE_PER_WEEK;
    return fee > LATE_CAP ? LATE_CAP : fee;
}

void iq_totals(long fee, int sib, int late_weeks, FEE_TOTALS *t)
{
    t->fee = fee;
    t->discount = iq_sibling_discount(fee, sib);
    t->late = iq_late_fee(late_weeks);
    t->total = fee - t->discount + t->late;
}

int iq_parse_month(const char *s, int *year, int *month)
{
    int i, m, y;
    if (strlen(s) != 6) return 0;
    for (i = 0; i < 6; i++)
        if (s[i] < '0' || s[i] > '9') return 0;
    m = (s[0] - '0') * 10 + (s[1] - '0');
    y = (s[2] - '0') * 1000 + (s[3] - '0') * 100 + (s[4] - '0') * 10 + (s[5] - '0');
    if (m < 1 || m > 12 || y < 1980 || y > 2099) return 0;
    *year = y;
    *month = m;
    return 1;
}
