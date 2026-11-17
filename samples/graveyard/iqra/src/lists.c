/* Students (paged), fee schedule, and today's receipts. */
#include <stdio.h>
#include <string.h>
#include "iqra.h"
#include "kbd.h"
#include "screen.h"
#include "ui.h"

#define PER_PAGE 17
#define MAX_ROWS 300

void students_screen(void)
{
    static unsigned long recnos[MAX_ROWS];
    DBF db;
    char rec[DBF_MAX_RECLEN], val[24], tmp[40];
    unsigned long r;
    int n = 0, page = 0, pages, i, row, k;

    if (!open_table(&db, F_STUDENT)) {
        ui_wait();
        return;
    }
    for (r = 0; r < db.nrecs && n < MAX_ROWS; r++)
        if (dbf_read(&db, r, rec) == DBF_OK && !dbf_is_deleted(rec)) recnos[n++] = r;
    pages = n == 0 ? 1 : (n + PER_PAGE - 1) / PER_PAGE;
    for (;;) {
        frame("STUDENTS");
        scr_put(3, 1, ATTR_HILITE, "ID     NAME                 FATHER               CLASS FAMILY CHILD");
        for (i = 0; i < PER_PAGE && page * PER_PAGE + i < n; i++) {
            row = 4 + i;
            dbf_read(&db, recnos[page * PER_PAGE + i], rec);
            dbf_get(&db, rec, field(&db, "STU_ID"), val);
            scr_put(row, 1, ATTR_BODY, val);
            dbf_get(&db, rec, field(&db, "NAME"), val);
            scr_putw(row, 8, ATTR_BODY, val, 20);
            dbf_get(&db, rec, field(&db, "FATHER"), val);
            scr_putw(row, 29, ATTR_BODY, val, 20);
            sprintf(tmp, "%5ld", dbf_get_num(&db, rec, field(&db, "CLASS")));
            scr_put(row, 49, ATTR_BODY, tmp);
            dbf_get(&db, rec, field(&db, "FAMILY"), val);
            scr_put(row, 56, ATTR_BODY, val);
            sprintf(tmp, "%5ld", dbf_get_num(&db, rec, field(&db, "SIB")));
            scr_put(row, 62, ATTR_BODY, tmp);
        }
        sprintf(tmp, "PAGE %d OF %d   %d STUDENTS", page + 1, pages, n);
        scr_put(22, 1, ATTR_BODY, tmp);
        ui_hint("PgDn=Next page  PgUp=Previous page  Esc=Back");
        k = kbd_get();
        if (k == KEY_ESC) break;
        if (k == KEY_PGDN && page + 1 < pages) page++;
        if (k == KEY_PGUP && page > 0) page--;
    }
    dbf_close(&db);
}

void schedule_screen(void)
{
    DBF db;
    char rec[DBF_MAX_RECLEN], tmp[16], out[16], line[40];
    unsigned long r;
    int row = 5;
    frame("FEE SCHEDULE");
    scr_put(2, 1, ATTR_BODY, "Monthly tuition fee, 2000-01 session. Due on the 10th of each month.");
    scr_put(4, 10, ATTR_HILITE, "CLASS       MONTHLY FEE");
    if (open_table(&db, F_FEES)) {
        for (r = 0; r < db.nrecs && row < 21; r++) {
            if (dbf_read(&db, r, rec) != DBF_OK || dbf_is_deleted(rec)) continue;
            ui_money(dbf_get_num(&db, rec, field(&db, "MONTHLY")), tmp);
            pad_left(tmp, 10, out);
            sprintf(line, "CLASS %2ld   %s", dbf_get_num(&db, rec, field(&db, "CLASS")), out);
            scr_put(row++, 10, ATTR_BODY, line);
        }
        dbf_close(&db);
    }
    ui_hint("Esc=Back");
    while (kbd_get() != KEY_ESC)
        ;
}

void today_screen(void)
{
    DBF db;
    STUDENT s;
    char rec[DBF_MAX_RECLEN], val[12], tmp[16], out[16], line[70];
    unsigned long r;
    long total = 0L, v;
    int count = 0, row = 5;

    frame("TODAY'S RECEIPTS");
    sprintf(line, "Receipts for %s", g_date);
    scr_put(2, 1, ATTR_BODY, line);
    scr_put(4, 1, ATTR_HILITE, "RECEIPT  STUDENT                      MONTH       TOTAL");
    if (open_table(&db, F_PAYMENT)) {
        for (r = 0; r < db.nrecs; r++) {
            if (dbf_read(&db, r, rec) != DBF_OK || dbf_is_deleted(rec)) continue;
            dbf_get(&db, rec, field(&db, "PAY_DATE"), val);
            if (strcmp(val, g_ymd) != 0) continue;
            count++;
            v = dbf_get_num(&db, rec, field(&db, "TOTAL"));
            total += v;
            if (row > 20) continue;
            dbf_get(&db, rec, field(&db, "STU_ID"), val);
            s.name[0] = '\0';
            find_student(val, &s);
            dbf_get(&db, rec, field(&db, "FEE_MONTH"), tmp);
            ui_money(v, out);
            sprintf(line, "%06ld   %-5s  %-20s  %.2s/%.4s %10s", dbf_get_num(&db, rec, field(&db, "RECEIPT")),
                    val, s.name, tmp + 4, tmp, out);
            scr_put(row++, 1, ATTR_BODY, line);
        }
        dbf_close(&db);
    }
    if (count == 0) scr_put(5, 1, ATTR_BODY, "NO RECEIPTS TODAY");
    ui_money(total, tmp);
    sprintf(line, "RECEIPTS: %d   COLLECTED: %s", count, tmp);
    scr_put(21, 1, ATTR_HILITE, line);
    ui_hint("Esc=Back");
    while (kbd_get() != KEY_ESC)
        ;
}
