/*
 * Barkat Kiryana Ledger (1996): the udhaar (credit) register of a kiryana store in Raja Bazaar,
 * Rawalpindi. A sample app written by the Afterlife team to simulate 1990s DOS software.
 * Letter-hotkey main menu and shared helpers.
 */
#include <ctype.h>
#include <dos.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "barkat.h"
#include "kbd.h"
#include "rules.h"
#include "screen.h"
#include "ui.h"

int g_year, g_month, g_day;
char g_date[9];
char g_ymd[9];

static char pending[64];
static unsigned char pending_attr;

void frame(const char *screen)
{
    ui_frame(APP_NAME, screen, g_date);
}

void say(const char *msg, unsigned char attr)
{
    strncpy(pending, msg, sizeof pending - 1);
    pending[sizeof pending - 1] = '\0';
    pending_attr = attr;
}

void show_pending(void)
{
    if (!pending[0]) return;
    ui_status(pending, pending_attr);
    pending[0] = '\0';
}

int open_table(DBF *db, const char *path)
{
    char msg[40];
    if (dbf_open(db, path) == DBF_OK) return 1;
    sprintf(msg, "CANNOT OPEN %s", path);
    ui_status(msg, ATTR_ERROR);
    return 0;
}

int field(const DBF *db, const char *name)
{
    int i = dbf_field_index(db, name);
    if (i < 0) {
        scr_done();
        printf("DATA FILE DAMAGED: NO FIELD %s\n", name);
        exit(2);
    }
    return i;
}

void pad_left(const char *s, int width, char *out)
{
    int n = (int)strlen(s);
    int i;
    for (i = 0; i < width - n; i++) out[i] = ' ';
    strcpy(out + (width > n ? width - n : 0), s);
}

void show_date(const char *ymd, char *out)
{
    if (strlen(ymd) < 8) {
        out[0] = '\0';
        return;
    }
    sprintf(out, "%.2s/%.2s/%.2s", ymd + 6, ymd + 4, ymd + 2);
}

int find_party(const char *id, PARTY *p)
{
    DBF db;
    char rec[DBF_MAX_RECLEN];
    unsigned long r;
    int fi;
    if (!open_table(&db, F_PARTY)) return 0;
    fi = field(&db, "PARTY_ID");
    for (r = 0; r < db.nrecs; r++) {
        if (dbf_read(&db, r, rec) != DBF_OK || dbf_is_deleted(rec)) continue;
        dbf_get(&db, rec, fi, p->id);
        if (strcmp(p->id, id) != 0) continue;
        dbf_get(&db, rec, field(&db, "NAME"), p->name);
        dbf_get(&db, rec, field(&db, "AREA"), p->area);
        dbf_get(&db, rec, field(&db, "LAST_PAY"), p->last_pay);
        /* Keep the raw field text, so ******** shows as it is stored. */
        memcpy(p->balance_text, rec + db.offset[field(&db, "BALANCE")], BALANCE_WIDTH);
        p->balance_text[BALANCE_WIDTH] = '\0';
        p->balance = bk_read_balance(p->balance_text);
        p->limit = dbf_get_num(&db, rec, field(&db, "LIMIT"));
        p->recno = r;
        dbf_close(&db);
        return 1;
    }
    dbf_close(&db);
    return 0;
}

static void today_load(void)
{
    struct dosdate_t d;
    _dos_getdate(&d);
    g_year = d.year;
    g_month = d.month;
    g_day = d.day;
    sprintf(g_date, "%02d/%02d/%02d", g_day, g_month, g_year % 100);
    sprintf(g_ymd, "%04d%02d%02d", g_year, g_month, g_day);
}

static void draw_menu(void)
{
    static const char *items[6] = {"S  Sale on credit (udhaar)", "P  Payment received",
                                   "L  Ledger of a party",       "B  Balances of all parties",
                                   "R  Reminders (no interest)", "X  Exit"};
    int i;
    frame("MAIN MENU");
    scr_put(3, 24, ATTR_HILITE, "BARKAT KIRYANA STORE");
    scr_put(4, 24, ATTR_BODY, "Raja Bazaar, Rawalpindi");
    for (i = 0; i < 6; i++) scr_put(8 + 2 * i, 24, ATTR_BODY, items[i]);
    ui_hint("Press a letter    Software by M. Yousaf, 1996");
}

int main(void)
{
    int k;
    today_load();
    scr_init();
    scr_cursor_visible(0);
    for (;;) {
        draw_menu();
        k = kbd_get();
        if (k < 128) k = toupper(k);
        if (k == 'S') entry_screen('S');
        else if (k == 'P') entry_screen('P');
        else if (k == 'L') ledger_screen();
        else if (k == 'B') balances_screen();
        else if (k == 'R') reminders_screen();
        else if (k == 'X') break;
        /* Esc and every other key keep the menu: Esc must never leave the program. */
    }
    scr_done();
    kbd_shutdown();
    return 0;
}
