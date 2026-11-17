/* Iqra School Fees 1.1 (2001). Shared declarations. */
#ifndef IQRA_H
#define IQRA_H

#include "dbf3.h"

#define APP_NAME "IQRA SCHOOL FEES 1.1"
#define F_STUDENT "STUDENT.DBF"
#define F_FEES "FEES.DBF"
#define F_PAYMENT "PAYMENT.DBF"

extern int g_year, g_month, g_day;
extern char g_date[11]; /* DD-MM-YYYY: written after Y2K, so four-digit years on screen */
extern char g_ymd[9];   /* YYYYMMDD */

void frame(const char *screen);
int open_table(DBF *db, const char *path);
int field(const DBF *db, const char *name);
void pad_left(const char *s, int width, char *out);
/* Keeps a status-line message across a screen redraw. */
void say(const char *msg, unsigned char attr);
void show_pending(void);

typedef struct {
    char id[6];
    char name[21];
    char father[21];
    char family[5];
    int cls;
    int sib;
} STUDENT;

int find_student(const char *id, STUDENT *s);

void collect_fee(void);
void students_screen(void);
void schedule_screen(void);
void today_screen(void);

#endif
