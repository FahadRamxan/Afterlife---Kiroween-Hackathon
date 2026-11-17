/* Barkat Kiryana Ledger (1996). Shared declarations. */
#ifndef BARKAT_H
#define BARKAT_H

#include "dbf3.h"

#define APP_NAME "BARKAT KIRYANA LEDGER"
#define F_PARTY "PARTY.DBF"
#define F_LEDGER "LEDGER.DBF"

extern int g_year, g_month, g_day;
extern char g_date[9]; /* DD/MM/YY */
extern char g_ymd[9];  /* YYYYMMDD */

void frame(const char *screen);
int open_table(DBF *db, const char *path);
int field(const DBF *db, const char *name);
void pad_left(const char *s, int width, char *out);
void say(const char *msg, unsigned char attr);
void show_pending(void);
/* DD/MM/YY from YYYYMMDD. */
void show_date(const char *ymd, char *out);

typedef struct {
    char id[5];
    char name[26];
    char area[16];
    char balance_text[9]; /* the BALANCE field as stored, maybe ******** */
    char last_pay[9];
    long limit;
    long balance;         /* what the app reads from balance_text */
    unsigned long recno;
} PARTY;

int find_party(const char *id, PARTY *p);

void entry_screen(char kind); /* 'S' sale on credit, 'P' payment */
void ledger_screen(void);
void balances_screen(void);
void reminders_screen(void);

#endif
