/* Ledger of one party, balances of all parties, and the monthly reminder list. */
#include <stdio.h>
#include <string.h>
#include "barkat.h"
#include "kbd.h"
#include "rules.h"
#include "screen.h"
#include "ui.h"

#define PER_PAGE 17
#define MAX_ROWS 200

static const char *MONTHS[12] = {"JANUARY", "FEBRUARY", "MARCH",     "APRIL",   "MAY",      "JUNE",
                                 "JULY",    "AUGUST",   "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"};

static void raw_balance(const DBF *db, const char *rec, char *out)
{
    memcpy(out, rec + db->offset[field(db, "BALANCE")], BALANCE_WIDTH);
    out[BALANCE_WIDTH] = '\0';
}

void ledger_screen(void)
{
    PARTY p;
    DBF db;
    char id[5], rec[DBF_MAX_RECLEN], val[24], date[9], amt[16], out[16], bal[9], line[80];
    unsigned long r, rows[MAX_ROWS];
    int n = 0, i, first, row, k;

    id[0] = '\0';
    for (;;) {
        frame("PARTY LEDGER");
        scr_put(2, 1, ATTR_BODY, "Party ID  :");
        ui_hint("Enter=Show ledger  Esc=Back to menu");
        show_pending();
        k = ui_input(2, 13, 4, id, UI_UPPER);
        if (k == KEY_ESC) return;
        if (k != KEY_ENTER) continue;
        if (find_party(id, &p)) break;
        say("PARTY NOT FOUND", ATTR_ERROR);
    }
    frame("PARTY LEDGER");
    sprintf(line, "%s  %s  (%s)", p.id, p.name, p.area);
    scr_put(2, 1, ATTR_HILITE, line);
    sprintf(line, "BALANCE RS %s", p.balance_text[0] == ' ' ? p.balance_text + strspn(p.balance_text, " ") : p.balance_text);
    scr_put(3, 1, ATTR_BODY, line);
    scr_put(5, 1, ATTR_HILITE, "DATE     KIND     AMOUNT  BALANCE  NOTE");
    if (open_table(&db, F_LEDGER)) {
        for (r = 0; r < db.nrecs && n < MAX_ROWS; r++) {
            if (dbf_read(&db, r, rec) != DBF_OK || dbf_is_deleted(rec)) continue;
            dbf_get(&db, rec, field(&db, "PARTY_ID"), val);
            if (strcmp(val, p.id) == 0) rows[n++] = r;
        }
        /* The last 15 entries. */
        first = n > 15 ? n - 15 : 0;
        for (i = first, row = 6; i < n; i++, row++) {
            dbf_read(&db, rows[i], rec);
            dbf_get(&db, rec, field(&db, "TX_DATE"), val);
            show_date(val, date);
            dbf_get(&db, rec, field(&db, "KIND"), val);
            ui_money(dbf_get_num(&db, rec, field(&db, "AMOUNT")), amt);
            pad_left(amt, 10, out);
            raw_balance(&db, rec, bal);
            sprintf(line, "%s %s %s %s  ", date, val[0] == 'P' ? "PAID" : "SALE", out, bal);
            scr_put(row, 1, ATTR_BODY, line);
            dbf_get(&db, rec, field(&db, "NOTE"), val);
            scr_put(row, 1 + (int)strlen(line), ATTR_BODY, val);
        }
        dbf_close(&db);
    }
    if (n == 0) scr_put(6, 1, ATTR_BODY, "NO ENTRIES");
    ui_hint("Esc=Back to menu");
    while (kbd_get() != KEY_ESC)
        ;
}

/* Fills rows with the live PARTY records that pass the filter (or all, if remind is 0). */
static int collect(DBF *db, unsigned long *rows, int remind)
{
    char rec[DBF_MAX_RECLEN], bal[9], last[9];
    unsigned long r;
    int n = 0;
    for (r = 0; r < db->nrecs && n < MAX_ROWS; r++) {
        if (dbf_read(db, r, rec) != DBF_OK || dbf_is_deleted(rec)) continue;
        if (remind) {
            raw_balance(db, rec, bal);
            dbf_get(db, rec, field(db, "LAST_PAY"), last);
            if (!bk_needs_reminder(bk_read_balance(bal), last, g_year, g_month)) continue;
        }
        rows[n++] = r;
    }
    return n;
}

static void party_page(int remind)
{
    static unsigned long rows[MAX_ROWS];
    DBF db;
    char rec[DBF_MAX_RECLEN], val[26], bal[9], tmp[16], out[16], line[80];
    long total = 0L;
    int n, i, page = 0, pages, row, k;

    if (!open_table(&db, F_PARTY)) {
        ui_wait();
        return;
    }
    n = collect(&db, rows, remind);
    for (i = 0; i < n; i++) {
        dbf_read(&db, rows[i], rec);
        raw_balance(&db, rec, bal);
        total += bk_read_balance(bal);
    }
    pages = n == 0 ? 1 : (n + PER_PAGE - 1) / PER_PAGE;
    for (;;) {
        if (remind) {
            frame("REMINDERS");
            sprintf(line, "%s %d - NO INTEREST, PLEASE CLEAR YOUR HISAB", MONTHS[g_month - 1], g_year);
            scr_put(2, 1, ATTR_HILITE, line);
            scr_put(3, 1, ATTR_HILITE, "ID   NAME                      AREA            BALANCE  LAST PAID");
        } else {
            frame("BALANCES");
            scr_put(3, 1, ATTR_HILITE, "ID   NAME                      AREA                LIMIT  BALANCE");
        }
        for (i = 0; i < PER_PAGE && page * PER_PAGE + i < n; i++) {
            row = 4 + i;
            dbf_read(&db, rows[page * PER_PAGE + i], rec);
            dbf_get(&db, rec, field(&db, "PARTY_ID"), val);
            scr_put(row, 1, ATTR_BODY, val);
            dbf_get(&db, rec, field(&db, "NAME"), val);
            scr_putw(row, 6, ATTR_BODY, val, 25);
            dbf_get(&db, rec, field(&db, "AREA"), val);
            scr_putw(row, 32, ATTR_BODY, val, 15);
            raw_balance(&db, rec, bal);
            if (remind) {
                scr_put(row, 48, ATTR_BODY, bal);
                dbf_get(&db, rec, field(&db, "LAST_PAY"), val);
                show_date(val, tmp);
                scr_put(row, 58, ATTR_BODY, tmp[0] ? tmp : "NEVER");
            } else {
                ui_money(dbf_get_num(&db, rec, field(&db, "LIMIT")), tmp);
                pad_left(tmp, 10, out);
                scr_put(row, 47, ATTR_BODY, out);
                scr_put(row, 58, ATTR_BODY, bal);
            }
        }
        ui_money(total, tmp);
        if (page + 1 == pages) {
            if (remind) sprintf(line, "PARTIES: %d   DUE: RS %s", n, tmp);
            else sprintf(line, "TOTAL OWED: RS %s", tmp);
            scr_put(21, 1, ATTR_HILITE, line);
        }
        sprintf(line, "PAGE %d OF %d", page + 1, pages);
        scr_put(22, 1, ATTR_BODY, line);
        ui_hint("PgDn=Next page  PgUp=Previous page  Esc=Back to menu");
        k = kbd_get();
        if (k == KEY_ESC) break;
        if (k == KEY_PGDN && page + 1 < pages) page++;
        if (k == KEY_PGUP && page > 0) page--;
    }
    dbf_close(&db);
}

void balances_screen(void)
{
    party_page(0);
}

void reminders_screen(void)
{
    party_page(1);
}
