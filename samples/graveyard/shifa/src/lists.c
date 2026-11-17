/* Stock list, customer list (with Add), and the daily report. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "kbd.h"
#include "rules.h"
#include "screen.h"
#include "shifa.h"
#include "ui.h"

#define PER_PAGE 17
#define ROW_FIRST 4
#define MAX_ROWS 300

static unsigned long recnos[MAX_ROWS];

/* Record numbers of the live (not deleted) rows of a file. Returns how many. */
static int live_rows(DBF *db)
{
    char rec[DBF_MAX_RECLEN];
    unsigned long r;
    int n = 0;
    for (r = 0; r < db->nrecs && n < MAX_ROWS; r++)
        if (dbf_read(db, r, rec) == DBF_OK && !dbf_is_deleted(rec)) recnos[n++] = r;
    return n;
}

static void page_footer(int page, int pages, int count, const char *what)
{
    char tmp[40];
    sprintf(tmp, "Page %d of %d   %d %s", page + 1, pages, count, what);
    scr_put(22, 1, ATTR_BODY, tmp);
}

static void draw_stock(DBF *db, int n, int page, int pages)
{
    char rec[DBF_MAX_RECLEN], val[24], tmp[16], out[16];
    int i, row, fc, fn, fb, fe, fp, fq;
    fc = field(db, "CODE");
    fn = field(db, "NAME");
    fb = field(db, "BATCH");
    fe = field(db, "EXPIRY");
    fp = field(db, "PRICE");
    fq = field(db, "QTY");
    frame("STOCK");
    scr_put(2, 1, ATTR_BODY, "Medicines in stock");
    scr_put(3, 1, ATTR_HILITE, "CODE   NAME                 BATCH    EXPIRY       PRICE    QTY");
    for (i = 0; i < PER_PAGE && page * PER_PAGE + i < n; i++) {
        row = ROW_FIRST + i;
        dbf_read(db, recnos[page * PER_PAGE + i], rec);
        dbf_get(db, rec, fc, val);
        scr_putw(row, 1, ATTR_BODY, val, 6);
        dbf_get(db, rec, fn, val);
        scr_putw(row, 8, ATTR_BODY, val, 20);
        dbf_get(db, rec, fb, val);
        scr_putw(row, 29, ATTR_BODY, val, 8);
        dbf_get(db, rec, fe, val);
        show_date(val, tmp);
        scr_putw(row, 38, ATTR_BODY, tmp, 8);
        if (rule_is_expired(val, g_year, g_month, g_day)) scr_put(row, 65, ATTR_HILITE, "EXPIRED");
        ui_money(dbf_get_num(db, rec, fp), tmp);
        pad_left(tmp, 9, out);
        scr_put(row, 47, ATTR_BODY, out);
        sprintf(tmp, "%ld", dbf_get_num(db, rec, fq));
        pad_left(tmp, 6, out);
        scr_put(row, 57, ATTR_BODY, out);
    }
    page_footer(page, pages, n, "items");
    ui_hint("PgDn=Next page  PgUp=Previous page  Esc=Back");
}

void stock_screen(void)
{
    DBF db;
    int n, pages, page = 0, k;
    if (!open_table(&db, F_MEDICINE)) {
        ui_wait();
        return;
    }
    n = live_rows(&db);
    pages = n == 0 ? 1 : (n + PER_PAGE - 1) / PER_PAGE;
    for (;;) {
        draw_stock(&db, n, page, pages);
        k = kbd_get();
        if (k == KEY_ESC) break;
        if (k == KEY_PGDN && page + 1 < pages) page++;
        if (k == KEY_PGUP && page > 0) page--;
    }
    dbf_close(&db);
}

/* --- Customers --- */

static char pending[48];
static unsigned char pending_attr;

static void draw_customers(int page)
{
    DBF db;
    char rec[DBF_MAX_RECLEN], val[28];
    int n, pages, i, row, fi, fn, fp;
    frame("CUSTOMERS");
    scr_put(3, 1, ATTR_HILITE, "ID     NAME                       PHONE");
    if (!open_table(&db, F_CUSTOMER)) return;
    fi = field(&db, "CUST_ID");
    fn = field(&db, "NAME");
    fp = field(&db, "PHONE");
    n = live_rows(&db);
    pages = n == 0 ? 1 : (n + PER_PAGE - 1) / PER_PAGE;
    if (page >= pages) page = pages - 1;
    for (i = 0; i < PER_PAGE && page * PER_PAGE + i < n; i++) {
        row = ROW_FIRST + i;
        dbf_read(&db, recnos[page * PER_PAGE + i], rec);
        dbf_get(&db, rec, fi, val);
        scr_putw(row, 1, ATTR_BODY, val, 5);
        dbf_get(&db, rec, fn, val);
        scr_putw(row, 8, ATTR_BODY, val, 25);
        dbf_get(&db, rec, fp, val);
        scr_putw(row, 35, ATTR_BODY, val, 12);
    }
    dbf_close(&db);
    page_footer(page, pages, n, "customers");
    ui_hint("A=Add customer  PgDn/PgUp=Page  Esc=Back");
    if (pending[0]) {
        ui_status(pending, pending_attr);
        pending[0] = '\0';
    }
}

static void say(const char *msg, unsigned char attr)
{
    strncpy(pending, msg, sizeof pending - 1);
    pending[sizeof pending - 1] = '\0';
    pending_attr = attr;
}

static void add_customer(void)
{
    DBF db;
    char rec[DBF_MAX_RECLEN], val[8], name[26], phone[13], id[6], msg[40];
    unsigned long r;
    int last = 0, fi;

    scr_put(20, 1, ATTR_BODY, "Name:");
    scr_put(21, 1, ATTR_BODY, "Phone:");
    ui_hint("Enter=Next  Esc=Cancel");
    name[0] = '\0';
    if (ui_input(20, 8, 25, name, UI_UPPER) != KEY_ENTER) return;
    if (name[0] == '\0') {
        say("NAME REQUIRED", ATTR_ERROR);
        return;
    }
    phone[0] = '\0';
    if (ui_input(21, 8, 12, phone, 0) != KEY_ENTER) return;

    if (!open_table(&db, F_CUSTOMER)) return;
    fi = field(&db, "CUST_ID");
    for (r = 0; r < db.nrecs; r++) {
        if (dbf_read(&db, r, rec) != DBF_OK) continue;
        dbf_get(&db, rec, fi, val);
        if (val[0] == 'C' && atoi(val + 1) > last) last = atoi(val + 1);
    }
    sprintf(id, "C%04d", last + 1);
    dbf_blank(&db, rec);
    dbf_put_str(&db, rec, fi, id);
    dbf_put_str(&db, rec, field(&db, "NAME"), name);
    dbf_put_str(&db, rec, field(&db, "PHONE"), phone);
    if (dbf_append(&db, rec) == DBF_OK) {
        sprintf(msg, "CUSTOMER %s ADDED", id);
        say(msg, ATTR_HILITE);
    } else {
        say("COULD NOT SAVE CUSTOMER", ATTR_ERROR);
    }
    dbf_close(&db);
}

void customers_screen(void)
{
    int page = 0, k;
    pending[0] = '\0';
    for (;;) {
        draw_customers(page);
        k = kbd_get();
        if (k == KEY_ESC) break;
        if (k == 'A' || k == 'a') add_customer();
        if (k == KEY_PGDN) page++;
        if (k == KEY_PGUP && page > 0) page--;
    }
}

/* --- Daily report --- */

void daily_report(void)
{
    DBF db;
    char rec[DBF_MAX_RECLEN], val[12], tmp[16], out[16], line[40];
    unsigned long r;
    long sales = 0L, gst = 0L;
    int count = 0, row = 5, fb, fd, fc, fs, fdi, fg, ft, k;
    static const int cols[4] = {22, 33, 44, 55};

    frame("DAILY REPORT");
    sprintf(line, "Bills for %s", g_date);
    scr_put(2, 1, ATTR_BODY, line);
    scr_put(4, 1, ATTR_HILITE, "BILL NO    CUSTOMER    SUBTOTAL   DISCOUNT        GST      TOTAL");
    if (open_table(&db, F_BILLS)) {
        fb = field(&db, "BILL_NO");
        fd = field(&db, "BILL_DATE");
        fc = field(&db, "CUST_ID");
        fs = field(&db, "SUBTOTAL");
        fdi = field(&db, "DISCOUNT");
        fg = field(&db, "GST");
        ft = field(&db, "TOTAL");
        for (r = 0; r < db.nrecs; r++) {
            long v[4];
            int i;
            if (dbf_read(&db, r, rec) != DBF_OK || dbf_is_deleted(rec)) continue;
            dbf_get(&db, rec, fd, val);
            if (strcmp(val, g_ymd) != 0) continue;
            count++;
            v[0] = dbf_get_num(&db, rec, fs);
            v[1] = dbf_get_num(&db, rec, fdi);
            v[2] = dbf_get_num(&db, rec, fg);
            v[3] = dbf_get_num(&db, rec, ft);
            gst += v[2];
            sales += v[3];
            if (row > 19) continue;
            dbf_get(&db, rec, fb, val);
            scr_put(row, 1, ATTR_BODY, val);
            dbf_get(&db, rec, fc, val);
            scr_put(row, 12, ATTR_BODY, val[0] ? val : "WALK-IN");
            for (i = 0; i < 4; i++) {
                ui_money(v[i], tmp);
                pad_left(tmp, 10, out);
                scr_put(row, cols[i], ATTR_BODY, out);
            }
            row++;
        }
        dbf_close(&db);
    }
    if (count == 0) scr_put(5, 1, ATTR_BODY, "NO BILLS TODAY");
    if (row > 19 && count > 15) scr_put(20, 1, ATTR_BODY, "... more bills not shown");
    ui_money(sales, tmp);
    ui_money(gst, out);
    sprintf(line, "BILLS: %d   SALES: %s   GST: %s", count, tmp, out);
    scr_put(21, 1, ATTR_HILITE, line);
    ui_hint("Esc=Back");
    do {
        k = kbd_get();
    } while (k != KEY_ESC);
}
