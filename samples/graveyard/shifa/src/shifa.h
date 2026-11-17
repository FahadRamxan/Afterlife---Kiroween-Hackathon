/* Shifa Medical Store v2.3 (1998). Shared declarations. */
#ifndef SHIFA_H
#define SHIFA_H

#include "dbf3.h"

#define APP_NAME "SHIFA MEDICAL STORE  v2.3"
#define F_MEDICINE "MEDICINE.DBF"
#define F_CUSTOMER "CUSTOMER.DBF"
#define F_BILLS "BILLS.DBF"
#define F_BILLITEM "BILLITEM.DBF"

/* Today from the DOS clock, read once at start. */
extern int g_year, g_month, g_day;
extern char g_date[9];  /* DD/MM/YY, for the screens */
extern char g_ymd[9];   /* YYYYMMDD, for DBF date fields */

void frame(const char *screen);
/* Shows an error on the status line. */
void error(const char *msg);
/* Shows a message and waits for a key. */
void notice(const char *msg);
/* Opens a data file, or shows an error and returns 0. */
int open_table(DBF *db, const char *path);
/* Field index by name. Stops the program if the file is not the expected shape. */
int field(const DBF *db, const char *name);
/* DD/MM/YY from YYYYMMDD. Blank stays blank. */
void show_date(const char *ymd, char *out);
void pad_left(const char *s, int width, char *out);

void new_bill(void);
void stock_screen(void);
void customers_screen(void);
void daily_report(void);

#endif
