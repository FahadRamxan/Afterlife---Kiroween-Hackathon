/*
 * Sale on credit and payment: party id, amount, note, then a Y/N confirm. A sale over the credit
 * limit and a payment over the balance are refused. Saving updates PARTY.BALANCE (and LAST_PAY
 * for a payment) and adds a LEDGER row with the balance after it.
 */
#include <ctype.h>
#include <stdio.h>
#include <string.h>
#include "barkat.h"
#include "kbd.h"
#include "rules.h"
#include "screen.h"
#include "ui.h"

static void draw(char kind, const PARTY *p, int have)
{
    char tmp[16], out[16], line[48];
    frame(kind == 'S' ? "SALE ON CREDIT" : "PAYMENT RECEIVED");
    scr_put(2, 1, ATTR_BODY, "Party ID  :");
    if (have) {
        scr_put(3, 1, ATTR_BODY, "Name      :");
        scr_put(3, 13, ATTR_HILITE, p->name);
        scr_put(4, 1, ATTR_BODY, "Area      :");
        scr_put(4, 13, ATTR_BODY, p->area);
        ui_money(p->limit, tmp);
        pad_left(tmp, 10, out);
        sprintf(line, "Limit     : %s", out);
        scr_put(5, 1, ATTR_BODY, line);
        sprintf(line, "Balance   :   %s", p->balance_text);
        scr_put(6, 1, ATTR_BODY, line);
    }
    scr_put(8, 1, ATTR_BODY, "Amount Rs :");
    scr_put(9, 1, ATTR_BODY, "Note      :");
    ui_hint("Enter=Next  Esc=Back to menu");
    show_pending();
}

static int save(char kind, const PARTY *p, long amount, const char *note, char *new_text)
{
    DBF db;
    char rec[DBF_MAX_RECLEN];
    unsigned long r;
    long last = 0L, n, newbal;
    int fb, rc;

    newbal = bk_apply(p->balance, kind, amount);
    bk_balance_field(newbal, new_text);

    if (!open_table(&db, F_PARTY)) return 0;
    if (dbf_read(&db, p->recno, rec) != DBF_OK) {
        dbf_close(&db);
        return 0;
    }
    fb = field(&db, "BALANCE");
    /* Written as STR(balance, 8, 2): ******** when it does not fit (LEGACY BUG). */
    memcpy(rec + db.offset[fb], new_text, BALANCE_WIDTH);
    if (kind == 'P') dbf_put_str(&db, rec, field(&db, "LAST_PAY"), g_ymd);
    rc = dbf_write(&db, p->recno, rec);
    dbf_set_date(&db, g_year - 1900, g_month, g_day);
    dbf_close(&db);
    if (rc != DBF_OK) return 0;

    if (!open_table(&db, F_LEDGER)) return 0;
    for (r = 0; r < db.nrecs; r++) {
        if (dbf_read(&db, r, rec) != DBF_OK) continue;
        n = dbf_get_num(&db, rec, field(&db, "ENTRY"));
        if (n > last) last = n;
    }
    dbf_blank(&db, rec);
    dbf_put_num(&db, rec, field(&db, "ENTRY"), last + 1L);
    dbf_put_str(&db, rec, field(&db, "TX_DATE"), g_ymd);
    dbf_put_str(&db, rec, field(&db, "PARTY_ID"), p->id);
    dbf_put_str(&db, rec, field(&db, "KIND"), kind == 'S' ? "S" : "P");
    dbf_put_num(&db, rec, field(&db, "AMOUNT"), amount);
    memcpy(rec + db.offset[field(&db, "BALANCE")], new_text, BALANCE_WIDTH);
    dbf_put_str(&db, rec, field(&db, "NOTE"), note);
    rc = dbf_append(&db, rec);
    dbf_set_date(&db, g_year - 1900, g_month, g_day);
    dbf_close(&db);
    return rc == DBF_OK;
}

void entry_screen(char kind)
{
    PARTY p;
    char id[5], amount_text[10], note[21], msg[64], tmp[16], tmp2[16], new_text[9], *t;
    long amount = 0L;
    int at = 0, have = 0, k;

    id[0] = amount_text[0] = note[0] = '\0';
    for (;;) {
        draw(kind, &p, have);
        scr_putw(2, 13, ATTR_FIELD, id, 4);
        scr_putw(8, 13, ATTR_FIELD, amount_text, 9);
        scr_putw(9, 13, ATTR_FIELD, note, 20);
        if (at == 0) {
            k = ui_input(2, 13, 4, id, UI_UPPER);
            if (k == KEY_ESC) return;
            if (k != KEY_ENTER) continue;
            have = find_party(id, &p);
            if (!have) say("PARTY NOT FOUND", ATTR_ERROR);
            else at = 1;
        } else if (at == 1) {
            k = ui_input(8, 13, 9, amount_text, UI_MONEY);
            if (k == KEY_ESC) return;
            if (k != KEY_ENTER) continue;
            amount = bk_parse_amount(amount_text);
            if (amount < 0L) {
                say("INVALID AMOUNT", ATTR_ERROR);
            } else if (kind == 'S' && !bk_sale_ok(p.balance, amount, p.limit)) {
                ui_money(p.limit, tmp);
                ui_money(bk_apply(p.balance, 'S', amount), tmp2);
                sprintf(msg, "OVER LIMIT RS %s - BALANCE WOULD BE RS %s", tmp, tmp2);
                say(msg, ATTR_ERROR);
            } else if (kind == 'P' && !bk_payment_ok(p.balance, amount)) {
                ui_money(p.balance, tmp);
                sprintf(msg, "PAYMENT MORE THAN BALANCE RS %s", tmp);
                say(msg, ATTR_ERROR);
            } else {
                at = 2;
            }
        } else {
            k = ui_input(9, 13, 20, note, UI_UPPER);
            if (k == KEY_ESC) return;
            if (k != KEY_ENTER) continue;
            ui_money(amount, tmp);
            sprintf(msg, "SAVE %s OF RS %s FOR %s? (Y/N)", kind == 'S' ? "SALE" : "PAYMENT", tmp, p.id);
            ui_status(msg, ATTR_HILITE);
            do {
                k = kbd_get();
                if (k < 128) k = toupper(k);
            } while (k != 'Y' && k != 'N' && k != KEY_ESC);
            if (k != 'Y') {
                ui_status("NOT SAVED - PRESS ANY KEY", ATTR_ERROR);
                ui_wait();
                return;
            }
            if (!save(kind, &p, amount, note, new_text)) {
                ui_status("COULD NOT SAVE - PRESS ANY KEY", ATTR_ERROR);
                ui_wait();
                return;
            }
            for (t = new_text; *t == ' '; t++)
                ;
            sprintf(msg, "SAVED. NEW BALANCE RS %s - PRESS ANY KEY", t);
            ui_status(msg, ATTR_HILITE);
            ui_wait();
            return;
        }
    }
}
