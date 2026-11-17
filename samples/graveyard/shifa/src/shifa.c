/*
 * Shifa Medical Store v2.3 (1998): billing and stock for a pharmacy in Rawalpindi.
 * A sample app written by the Afterlife team to simulate 1990s software.
 * Main menu and shared helpers.
 */
#include <dos.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "kbd.h"
#include "screen.h"
#include "shifa.h"
#include "ui.h"

int g_year, g_month, g_day;
char g_date[9];
char g_ymd[9];

void frame(const char *screen)
{
    ui_frame(APP_NAME, screen, g_date);
}

void error(const char *msg)
{
    ui_status(msg, ATTR_ERROR);
}

void notice(const char *msg)
{
    ui_status(msg, ATTR_HILITE);
    ui_wait();
    ui_status_clear();
}

int open_table(DBF *db, const char *path)
{
    char msg[40];
    if (dbf_open(db, path) == DBF_OK) return 1;
    sprintf(msg, "CANNOT OPEN %s", path);
    error(msg);
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

void show_date(const char *ymd, char *out)
{
    if (strlen(ymd) < 8) {
        out[0] = '\0';
        return;
    }
    sprintf(out, "%.2s/%.2s/%.2s", ymd + 6, ymd + 4, ymd + 2);
}

void pad_left(const char *s, int width, char *out)
{
    int n = (int)strlen(s);
    int i;
    for (i = 0; i < width - n; i++) out[i] = ' ';
    strcpy(out + (width > n ? width - n : 0), s);
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
    static const char *items[5] = {"1  New Bill", "2  Stock", "3  Customers", "4  Daily Report",
                                   "5  Exit"};
    int i;
    frame("MAIN MENU");
    scr_put(3, 21, ATTR_HILITE, "S H I F A   M E D I C A L   S T O R E");
    scr_put(4, 27, ATTR_BODY, "Satellite Town, Rawalpindi");
    /* Box with CP437 line characters. */
    scr_fill(7, 27, 1, ATTR_BODY, (char)0xDA);
    scr_fill(7, 28, 24, ATTR_BODY, (char)0xC4);
    scr_fill(7, 52, 1, ATTR_BODY, (char)0xBF);
    for (i = 8; i < 15; i++) {
        scr_fill(i, 27, 1, ATTR_BODY, (char)0xB3);
        scr_fill(i, 52, 1, ATTR_BODY, (char)0xB3);
    }
    scr_fill(15, 27, 1, ATTR_BODY, (char)0xC0);
    scr_fill(15, 28, 24, ATTR_BODY, (char)0xC4);
    scr_fill(15, 52, 1, ATTR_BODY, (char)0xD9);
    for (i = 0; i < 5; i++) scr_put(9 + i, 32, ATTR_BODY, items[i]);
    scr_put(18, 32, ATTR_BODY, "Choice:");
    ui_hint("1-5 Select    (C) 1998 Shifa Software House, Rawalpindi");
    scr_cursor(18, 40);
    scr_cursor_visible(1);
}

int main(void)
{
    int k;
    today_load();
    scr_init();
    for (;;) {
        draw_menu();
        k = kbd_get();
        scr_cursor_visible(0);
        if (k == '1') new_bill();
        else if (k == '2') stock_screen();
        else if (k == '3') customers_screen();
        else if (k == '4') daily_report();
        else if (k == '5') break;
        /* Any other key, Esc included, keeps the menu: Esc must never leave the program. */
    }
    scr_done();
    kbd_shutdown();
    return 0;
}
