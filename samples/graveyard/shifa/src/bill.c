/*
 * New Bill: pick a customer (or walk-in), add medicines, then F2 saves the bill, its items, and
 * takes the stock down. Bills over Rs 5,000 get 10% off, then 17% GST (rules.c).
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "kbd.h"
#include "rules.h"
#include "screen.h"
#include "shifa.h"
#include "ui.h"

#define MAX_LINES 13 /* rows 5 to 17; the totals start at row 18 */
#define ROW_LINES 5
#define ROW_PROMPT 21

typedef struct {
    char code[7];
    char name[21];
    char batch[9];
    long price;
    long qty;
    long amount;
    unsigned long recno;
} LINE;

static LINE lines[MAX_LINES];
static int nlines;
static char cust_id[6];
static char cust_name[26];
/* The bill screen is redrawn after every action, so an error is kept here and shown again. */
static char pending[48];

static void say(const char *msg)
{
    strncpy(pending, msg, sizeof pending - 1);
    pending[sizeof pending - 1] = '\0';
}

static void draw_line(int i)
{
    char price[12], qty[8], amount[14], tmp[14];
    int row = ROW_LINES + i;
    sprintf(tmp, "%2d", i + 1);
    scr_put(row, 1, ATTR_BODY, tmp);
    scr_putw(row, 4, ATTR_BODY, lines[i].code, 6);
    scr_putw(row, 11, ATTR_BODY, lines[i].name, 20);
    scr_putw(row, 32, ATTR_BODY, lines[i].batch, 8);
    ui_money(lines[i].price, tmp);
    pad_left(tmp, 9, price);
    scr_put(row, 41, ATTR_BODY, price);
    sprintf(tmp, "%ld", lines[i].qty);
    pad_left(tmp, 5, qty);
    scr_put(row, 51, ATTR_BODY, qty);
    ui_money(lines[i].amount, tmp);
    pad_left(tmp, 11, amount);
    scr_put(row, 57, ATTR_BODY, amount);
}

static long subtotal(void)
{
    long s = 0L;
    int i;
    for (i = 0; i < nlines; i++) s += lines[i].amount;
    return s;
}

static void draw_bill(void)
{
    char tmp[14], amount[14];
    int i;
    frame("NEW BILL");
    scr_put(2, 1, ATTR_BODY, "Customer:");
    scr_put(2, 11, ATTR_HILITE, cust_id[0] ? cust_id : "WALK-IN");
    scr_put(2, 18, ATTR_BODY, cust_name);
    scr_put(4, 1, ATTR_HILITE, " # CODE   NAME                 BATCH        PRICE   QTY      AMOUNT");
    for (i = 0; i < nlines; i++) draw_line(i);
    scr_fill(19, 1, 67, ATTR_BODY, (char)0xC4);
    ui_money(subtotal(), tmp);
    pad_left(tmp, 11, amount);
    scr_put(20, 45, ATTR_BODY, "SUBTOTAL");
    scr_put(20, 57, ATTR_HILITE, amount);
    scr_put(ROW_PROMPT, 1, ATTR_BODY, "Code:");
    scr_put(ROW_PROMPT, 16, ATTR_BODY, "Qty:");
    ui_hint("Enter=Add  Enter on blank code=Finish  F3=Edit last qty  Esc=Cancel");
    if (pending[0]) {
        error(pending);
        pending[0] = '\0';
    }
}

/* Finds a medicine by code. Fills line (without qty) and returns 1, or returns 0. */
static int find_medicine(const char *code, LINE *line, char *expiry, long *stock)
{
    DBF db;
    char rec[DBF_MAX_RECLEN];
    char val[24];
    unsigned long r;
    int fc, fn, fb, fe, fp, fq;
    if (!open_table(&db, F_MEDICINE)) return 0;
    fc = field(&db, "CODE");
    fn = field(&db, "NAME");
    fb = field(&db, "BATCH");
    fe = field(&db, "EXPIRY");
    fp = field(&db, "PRICE");
    fq = field(&db, "QTY");
    for (r = 0; r < db.nrecs; r++) {
        if (dbf_read(&db, r, rec) != DBF_OK || dbf_is_deleted(rec)) continue;
        dbf_get(&db, rec, fc, val);
        if (strcmp(val, code) != 0) continue;
        strcpy(line->code, val);
        dbf_get(&db, rec, fn, line->name);
        dbf_get(&db, rec, fb, line->batch);
        dbf_get(&db, rec, fe, expiry);
        line->price = dbf_get_num(&db, rec, fp);
        *stock = dbf_get_num(&db, rec, fq);
        line->recno = r;
        dbf_close(&db);
        return 1;
    }
    dbf_close(&db);
    return 0;
}

static int find_customer(const char *id)
{
    DBF db;
    char rec[DBF_MAX_RECLEN];
    char val[8];
    unsigned long r;
    int fi, fn;
    if (!open_table(&db, F_CUSTOMER)) return 0;
    fi = field(&db, "CUST_ID");
    fn = field(&db, "NAME");
    for (r = 0; r < db.nrecs; r++) {
        if (dbf_read(&db, r, rec) != DBF_OK || dbf_is_deleted(rec)) continue;
        dbf_get(&db, rec, fi, val);
        if (strcmp(val, id) == 0) {
            dbf_get(&db, rec, fn, cust_name);
            dbf_close(&db);
            return 1;
        }
    }
    dbf_close(&db);
    return 0;
}

static int ask_customer(void)
{
    char id[6];
    cust_id[0] = '\0';
    cust_name[0] = '\0';
    for (;;) {
        frame("NEW BILL");
        scr_put(2, 1, ATTR_BODY, "Customer ID (blank = walk-in):");
        ui_hint("Enter=Continue  Esc=Back to menu");
        id[0] = '\0';
        if (ui_input(2, 32, 5, id, UI_UPPER) == KEY_ESC) return 0;
        if (id[0] == '\0') return 1;
        if (find_customer(id)) {
            strcpy(cust_id, id);
            return 1;
        }
        error("CUSTOMER NOT FOUND");
        ui_wait();
    }
}

/* Adds the medicine with this code to the bill, or explains on the status line why not. */
static void add_line(const char *code)
{
    LINE line;
    char expiry[9], qty_text[5], msg[48];
    long stock;
    int i, err = 0;

    if (!find_medicine(code, &line, expiry, &stock)) {
        say("MEDICINE NOT FOUND");
        return;
    }
    if (rule_is_expired(expiry, g_year, g_month, g_day)) {
        sprintf(msg, "BATCH %s EXPIRED - CANNOT SELL", line.batch);
        say(msg);
        return;
    }
    for (i = 0; i < nlines; i++) {
        if (strcmp(lines[i].code, line.code) == 0) {
            say("ALREADY IN BILL");
            return;
        }
    }
    if (nlines == MAX_LINES) {
        say("BILL IS FULL");
        return;
    }
    scr_putw(ROW_PROMPT, 28, ATTR_HILITE, line.name, 20);
    qty_text[0] = '\0';
    if (ui_input(ROW_PROMPT, 21, 4, qty_text, UI_DIGITS) != KEY_ENTER) return;
    line.qty = atol(qty_text);
    if (!rule_qty_ok_on_entry(line.qty, stock)) {
        sprintf(msg, "ONLY %ld IN STOCK", stock);
        say(msg);
        return;
    }
    line.amount = rule_line_amount(line.price, line.qty, &err);
    if (err) {
        say("AMOUNT TOO LARGE");
        return;
    }
    lines[nlines++] = line;
}

/* F3: changes the quantity of the last line. LEGACY BUG 2: the stock is not checked here. */
static void edit_last(void)
{
    char qty_text[5];
    long qty, amount;
    int err = 0;
    LINE *last;
    if (nlines == 0) {
        say("NO LINE TO EDIT");
        return;
    }
    last = &lines[nlines - 1];
    scr_put(ROW_PROMPT, 28, ATTR_HILITE, "New qty for line");
    qty_text[0] = '\0';
    if (ui_input(ROW_PROMPT, 21, 4, qty_text, UI_DIGITS) != KEY_ENTER) return;
    qty = atol(qty_text);
    amount = rule_line_amount(last->price, qty, &err);
    if (err) {
        say("AMOUNT TOO LARGE");
        return;
    }
    last->qty = qty;
    last->amount = amount;
}

static void put_money(DBF *db, char *rec, const char *name, long v)
{
    dbf_put_num(db, rec, field(db, name), v);
}

/* Writes the bill, its items and the new stock. Returns 0 if a file could not be written. */
static int save_bill(const BILL_TOTALS *t, char *bill_no)
{
    DBF db;
    char rec[DBF_MAX_RECLEN];
    char val[12];
    unsigned long r;
    int i, seq, last = 0, fb;

    if (!open_table(&db, F_BILLS)) return 0;
    fb = field(&db, "BILL_NO");
    for (r = 0; r < db.nrecs; r++) {
        if (dbf_read(&db, r, rec) != DBF_OK) continue;
        dbf_get(&db, rec, fb, val);
        seq = rule_bill_seq(val, g_year, g_month);
        if (seq > last) last = seq;
    }
    rule_bill_no(g_year, g_month, last + 1, bill_no);
    dbf_blank(&db, rec);
    dbf_put_str(&db, rec, fb, bill_no);
    dbf_put_str(&db, rec, field(&db, "BILL_DATE"), g_ymd);
    dbf_put_str(&db, rec, field(&db, "CUST_ID"), cust_id);
    put_money(&db, rec, "SUBTOTAL", t->subtotal);
    put_money(&db, rec, "DISCOUNT", t->discount);
    put_money(&db, rec, "GST", t->gst);
    put_money(&db, rec, "TOTAL", t->total);
    i = dbf_append(&db, rec);
    dbf_close(&db);
    if (i != DBF_OK) return 0;

    if (!open_table(&db, F_BILLITEM)) return 0;
    for (i = 0; i < nlines; i++) {
        dbf_blank(&db, rec);
        dbf_put_str(&db, rec, field(&db, "BILL_NO"), bill_no);
        dbf_put_num(&db, rec, field(&db, "LINE"), (long)(i + 1));
        dbf_put_str(&db, rec, field(&db, "CODE"), lines[i].code);
        dbf_put_num(&db, rec, field(&db, "QTY"), lines[i].qty);
        put_money(&db, rec, "PRICE", lines[i].price);
        put_money(&db, rec, "AMOUNT", lines[i].amount);
        dbf_append(&db, rec);
    }
    dbf_close(&db);

    if (!open_table(&db, F_MEDICINE)) return 0;
    for (i = 0; i < nlines; i++) {
        int fq = field(&db, "QTY");
        if (dbf_read(&db, lines[i].recno, rec) != DBF_OK) continue;
        /* LEGACY BUG 2 shows here: nothing stops the stock going below zero. */
        dbf_put_num(&db, rec, fq, dbf_get_num(&db, rec, fq) - lines[i].qty);
        dbf_write(&db, lines[i].recno, rec);
    }
    dbf_close(&db);
    return 1;
}

static void show_totals(const BILL_TOTALS *t)
{
    static const char *labels[4] = {"SUBTOTAL", "DISCOUNT 10%", "GST 17%", "TOTAL"};
    long values[4];
    char tmp[14], amount[14];
    int i;
    values[0] = t->subtotal;
    values[1] = t->discount;
    values[2] = t->gst;
    values[3] = t->total;
    for (i = 19; i <= 22; i++) scr_fill(i, 0, SCR_COLS, ATTR_BODY, ' ');
    scr_fill(18, 1, 67, ATTR_BODY, (char)0xC4);
    for (i = 0; i < 4; i++) {
        ui_money(values[i], tmp);
        pad_left(tmp, 11, amount);
        scr_put(19 + i, 41, i == 3 ? ATTR_HILITE : ATTR_BODY, labels[i]);
        scr_put(19 + i, 57, i == 3 ? ATTR_HILITE : ATTR_BODY, amount);
    }
    ui_hint("F2=Save bill  Esc=Cancel");
}

void new_bill(void)
{
    char code[7], bill_no[10], msg[40];
    BILL_TOTALS t;
    int k;

    nlines = 0;
    pending[0] = '\0';
    if (!ask_customer()) return;
    for (;;) {
        draw_bill();
        code[0] = '\0';
        k = ui_input(ROW_PROMPT, 7, 6, code, UI_UPPER);
        if (k == KEY_ESC) {
            notice("BILL CANCELLED - PRESS ANY KEY");
            return;
        }
        if (k == KEY_F3) {
            edit_last();
            continue;
        }
        if (k != KEY_ENTER) continue;
        if (code[0] == '\0') {
            if (nlines > 0) break;
            say("NO ITEMS IN BILL");
            continue;
        }
        add_line(code);
    }

    rule_totals(subtotal(), &t);
    if (t.total > LINE_MAX_PAISA) {
        notice("BILL TOO LARGE - PRESS ANY KEY");
        return;
    }
    show_totals(&t);
    for (;;) {
        k = ui_wait();
        if (k == KEY_ESC) {
            notice("BILL CANCELLED - PRESS ANY KEY");
            return;
        }
        if (k == KEY_F2) break;
    }
    if (!save_bill(&t, bill_no)) {
        notice("COULD NOT SAVE BILL - PRESS ANY KEY");
        return;
    }
    sprintf(msg, "BILL %s SAVED - PRESS ANY KEY", bill_no);
    notice(msg);
}
