/*
 * Iqra School Fees 1.1 (2001): monthly fee collection for Iqra Model School, Chaklala Scheme III,
 * Rawalpindi. A sample app written by the Afterlife team to simulate early-2000s DOS software.
 * Highlight-bar main menu and shared helpers.
 */
#include <dos.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "iqra.h"
#include "kbd.h"
#include "screen.h"
#include "ui.h"

#define ATTR_BAR 0x70 /* black on grey: the selected menu item */

int g_year, g_month, g_day;
char g_date[11];
char g_ymd[9];

static char pending[60];
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

int find_student(const char *id, STUDENT *s)
{
    DBF db;
    char rec[DBF_MAX_RECLEN];
    unsigned long r;
    int fi;
    if (!open_table(&db, F_STUDENT)) return 0;
    fi = field(&db, "STU_ID");
    for (r = 0; r < db.nrecs; r++) {
        if (dbf_read(&db, r, rec) != DBF_OK || dbf_is_deleted(rec)) continue;
        dbf_get(&db, rec, fi, s->id);
        if (strcmp(s->id, id) != 0) continue;
        dbf_get(&db, rec, field(&db, "NAME"), s->name);
        dbf_get(&db, rec, field(&db, "FATHER"), s->father);
        dbf_get(&db, rec, field(&db, "FAMILY"), s->family);
        s->cls = (int)dbf_get_num(&db, rec, field(&db, "CLASS"));
        s->sib = (int)dbf_get_num(&db, rec, field(&db, "SIB"));
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
    sprintf(g_date, "%02d-%02d-%04d", g_day, g_month, g_year);
    sprintf(g_ymd, "%04d%02d%02d", g_year, g_month, g_day);
}

#define NITEMS 5
static const char *items[NITEMS] = {"Collect Fee", "Students", "Fee Schedule", "Today's Receipts",
                                    "Exit"};

static void draw_menu(int sel)
{
    int i;
    frame("MAIN MENU");
    scr_put(3, 28, ATTR_HILITE, "IQRA MODEL SCHOOL");
    scr_put(4, 23, ATTR_BODY, "Chaklala Scheme III, Rawalpindi");
    for (i = 0; i < NITEMS; i++) {
        unsigned char a = i == sel ? ATTR_BAR : ATTR_BODY;
        scr_fill(8 + 2 * i, 28, 22, a, ' ');
        scr_put(8 + 2 * i, 30, a, items[i]);
    }
    ui_hint("Up/Down=Move  Enter=Select    Iqra Soft (C) 2001");
}

int main(void)
{
    int sel, k;
    today_load();
    scr_init();
    scr_cursor_visible(0);
    for (;;) {
        sel = 0;
        for (;;) {
            draw_menu(sel);
            k = kbd_get();
            if (k == KEY_DOWN) sel = (sel + 1) % NITEMS;
            else if (k == KEY_UP) sel = (sel + NITEMS - 1) % NITEMS;
            else if (k == KEY_ENTER) break;
            /* Esc and every other key keep the menu: Esc must never leave the program. */
        }
        if (sel == 0) collect_fee();
        else if (sel == 1) students_screen();
        else if (sel == 2) schedule_screen();
        else if (sel == 3) today_screen();
        else break;
    }
    scr_done();
    kbd_shutdown();
    return 0;
}
