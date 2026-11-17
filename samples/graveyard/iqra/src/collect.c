/*
 * Collect Fee: student id, fee month (MMYYYY, defaults to this month). Enter on the month shows
 * the fee, the sibling discount and the late fee. F2 calculates and saves, and prints the receipt
 * number. Up goes back to the student field. Esc goes back to the menu without saving.
 */
#include <stdio.h>
#include <string.h>
#include "iqra.h"
#include "kbd.h"
#include "rules.h"
#include "screen.h"
#include "ui.h"

static long class_fee(int cls)
{
    DBF db;
    char rec[DBF_MAX_RECLEN];
    unsigned long r;
    long fee = -1L;
    int fc, fm;
    if (!open_table(&db, F_FEES)) return -1L;
    fc = field(&db, "CLASS");
    fm = field(&db, "MONTHLY");
    for (r = 0; r < db.nrecs; r++) {
        if (dbf_read(&db, r, rec) != DBF_OK || dbf_is_deleted(rec)) continue;
        if (dbf_get_num(&db, rec, fc) == (long)cls) {
            fee = dbf_get_num(&db, rec, fm);
            break;
        }
    }
    dbf_close(&db);
    return fee;
}

/* Receipt number already issued for this student and month, or 0. Also returns the last receipt
 * number in *last, so the next one is *last + 1. */
static long paid_receipt(const char *id, const char *yyyymm, long *last)
{
    DBF db;
    char rec[DBF_MAX_RECLEN], sid[6], mon[7];
    unsigned long r;
    long found = 0L, n;
    int fr, fs, fm;
    *last = 0L;
    if (!open_table(&db, F_PAYMENT)) return 0L;
    fr = field(&db, "RECEIPT");
    fs = field(&db, "STU_ID");
    fm = field(&db, "FEE_MONTH");
    for (r = 0; r < db.nrecs; r++) {
        if (dbf_read(&db, r, rec) != DBF_OK) continue;
        n = dbf_get_num(&db, rec, fr);
        if (n > *last) *last = n;
        if (dbf_is_deleted(rec)) continue;
        dbf_get(&db, rec, fs, sid);
        dbf_get(&db, rec, fm, mon);
        if (strcmp(sid, id) == 0 && strcmp(mon, yyyymm) == 0) found = n;
    }
    dbf_close(&db);
    return found;
}

static void draw(const STUDENT *s, int have_student)
{
    char tmp[40];
    frame("COLLECT FEE");
    scr_put(2, 1, ATTR_BODY, "Student ID :");
    scr_put(7, 1, ATTR_BODY, "Fee month (MMYYYY) :");
    if (have_student) {
        scr_put(3, 1, ATTR_BODY, "Name       :");
        scr_put(3, 14, ATTR_HILITE, s->name);
        scr_put(4, 1, ATTR_BODY, "Father     :");
        scr_put(4, 14, ATTR_BODY, s->father);
        sprintf(tmp, "Class      : %d", s->cls);
        scr_put(5, 1, ATTR_BODY, tmp);
        sprintf(tmp, "Family     : %s   Child no. %d", s->family, s->sib);
        scr_put(5, 30, ATTR_BODY, tmp);
    }
    ui_hint("Enter=Next  Up=Previous field  F2=Save receipt  Esc=Back");
    show_pending();
}

static void show_totals(const FEE_TOTALS *t, int weeks, int cls)
{
    char label[32], tmp[16], out[16];
    const char *labels[4];
    long values[4];
    int i;
    sprintf(label, "LATE FEE (%d WK)", weeks);
    labels[0] = "MONTHLY FEE";
    labels[1] = "SIBLING DISCOUNT 15%";
    labels[2] = label;
    labels[3] = "TOTAL";
    values[0] = t->fee;
    values[1] = t->discount;
    values[2] = t->late;
    values[3] = t->total;
    for (i = 0; i < 4; i++) {
        ui_money(values[i], tmp);
        pad_left(tmp, 10, out);
        scr_put(10 + i + (i == 3), 10, i == 3 ? ATTR_HILITE : ATTR_BODY, labels[i]);
        scr_put(10 + i + (i == 3), 40, i == 3 ? ATTR_HILITE : ATTR_BODY, out);
    }
    if (cls > 0) {
        sprintf(tmp, "(class %d)", cls);
        scr_put(10, 22, ATTR_BODY, tmp);
    }
    scr_fill(13, 10, 40, ATTR_BODY, (char)0xC4);
}

/* Validates the month and works out the totals. Returns 1, or 0 with an error said. */
static int calculate(const STUDENT *s, const char *month, FEE_TOTALS *t, int *weeks, char *yyyymm)
{
    char msg[60];
    long fee, rcpt, last;
    int y, m;
    if (!iq_parse_month(month, &y, &m)) {
        say("INVALID MONTH - USE MMYYYY", ATTR_ERROR);
        return 0;
    }
    sprintf(yyyymm, "%04d%02d", y, m);
    rcpt = paid_receipt(s->id, yyyymm, &last);
    if (rcpt) {
        sprintf(msg, "FEE FOR %02d/%04d ALREADY PAID (RECEIPT %06ld)", m, y, rcpt);
        say(msg, ATTR_ERROR);
        return 0;
    }
    fee = class_fee(s->cls);
    if (fee < 0L) {
        say("NO FEE SET FOR THIS CLASS", ATTR_ERROR);
        return 0;
    }
    *weeks = iq_late_weeks(g_year, g_month, g_day, y, m);
    iq_totals(fee, s->sib, *weeks, t);
    return 1;
}

static int save(const STUDENT *s, const FEE_TOTALS *t, const char *yyyymm, long *receipt)
{
    DBF db;
    char rec[DBF_MAX_RECLEN];
    long last;
    int rc;
    paid_receipt(s->id, yyyymm, &last);
    *receipt = last + 1L;
    if (!open_table(&db, F_PAYMENT)) return 0;
    dbf_blank(&db, rec);
    dbf_put_num(&db, rec, field(&db, "RECEIPT"), *receipt);
    dbf_put_str(&db, rec, field(&db, "PAY_DATE"), g_ymd);
    dbf_put_str(&db, rec, field(&db, "STU_ID"), s->id);
    dbf_put_str(&db, rec, field(&db, "FEE_MONTH"), yyyymm);
    dbf_put_num(&db, rec, field(&db, "FEE"), t->fee);
    dbf_put_num(&db, rec, field(&db, "DISCOUNT"), t->discount);
    dbf_put_num(&db, rec, field(&db, "LATE_FEE"), t->late);
    dbf_put_num(&db, rec, field(&db, "TOTAL"), t->total);
    rc = dbf_append(&db, rec);
    dbf_set_date(&db, g_year - 1900, g_month, g_day);
    dbf_close(&db);
    return rc == DBF_OK;
}

void collect_fee(void)
{
    STUDENT s;
    FEE_TOTALS t;
    char id[6], month[7], yyyymm[7], msg[48];
    int have = 0, shown = 0, weeks = 0, at = 0, k;
    long receipt;

    id[0] = '\0';
    sprintf(month, "%02d%04d", g_month, g_year);
    for (;;) {
        draw(&s, have);
        scr_putw(2, 14, ATTR_FIELD, id, 5);
        scr_putw(7, 22, ATTR_FIELD, month, 6);
        if (shown) show_totals(&t, weeks, s.cls);
        if (at == 0) {
            k = ui_input(2, 14, 5, id, UI_UPPER);
            if (k == KEY_ESC) return;
            if (k != KEY_ENTER && k != KEY_DOWN && k != KEY_F2) continue;
            have = find_student(id, &s);
            shown = 0;
            if (!have) {
                say("STUDENT NOT FOUND", ATTR_ERROR);
                continue;
            }
            if (k != KEY_F2) {
                at = 1;
                continue;
            }
        } else {
            k = ui_input(7, 22, 6, month, UI_DIGITS);
            if (k == KEY_ESC) return;
            if (k == KEY_UP) {
                at = 0;
                shown = 0;
                continue;
            }
            if (k != KEY_ENTER && k != KEY_F2) continue;
        }
        shown = calculate(&s, month, &t, &weeks, yyyymm);
        if (!shown || k != KEY_F2) continue;
        if (!save(&s, &t, yyyymm, &receipt)) {
            say("COULD NOT SAVE RECEIPT", ATTR_ERROR);
            continue;
        }
        draw(&s, have);
        show_totals(&t, weeks, s.cls);
        sprintf(msg, "RECEIPT %06ld SAVED - PRESS ANY KEY", receipt);
        ui_status(msg, ATTR_HILITE);
        ui_wait();
        return;
    }
}
