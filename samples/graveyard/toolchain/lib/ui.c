/* See ui.h. */
#include <ctype.h>
#include <stdio.h>
#include <string.h>
#include "kbd.h"
#include "screen.h"
#include "ui.h"

void ui_frame(const char *app, const char *screen, const char *date)
{
    int len = (int)strlen(screen);
    scr_clear(ATTR_BODY);
    scr_fill(0, 0, SCR_COLS, ATTR_TITLE, ' ');
    scr_put(0, 1, ATTR_TITLE, app);
    scr_put(0, (SCR_COLS - len) / 2, ATTR_TITLE, screen);
    scr_put(0, SCR_COLS - 1 - (int)strlen(date), ATTR_TITLE, date);
    scr_fill(ROW_HINT, 0, SCR_COLS, ATTR_HINT, ' ');
}

void ui_hint(const char *text)
{
    scr_fill(ROW_HINT, 0, SCR_COLS, ATTR_HINT, ' ');
    scr_put(ROW_HINT, 1, ATTR_HINT, text);
}

void ui_status(const char *msg, unsigned char attr)
{
    scr_fill(ROW_STATUS, 0, SCR_COLS, ATTR_BODY, ' ');
    scr_put(ROW_STATUS, 1, attr, " ");
    scr_put(ROW_STATUS, 2, attr, msg);
    scr_put(ROW_STATUS, 2 + (int)strlen(msg), attr, " ");
}

void ui_status_clear(void)
{
    scr_fill(ROW_STATUS, 0, SCR_COLS, ATTR_BODY, ' ');
}

int ui_input(int row, int col, int len, char *buf, int flags)
{
    int n = (int)strlen(buf);
    int k;
    scr_cursor_visible(1);
    for (;;) {
        scr_putw(row, col, ATTR_FIELD, buf, len);
        scr_cursor(row, col + (n < len ? n : len - 1));
        k = kbd_get();
        if (k == KEY_ENTER || k == KEY_ESC || k >= KEY_EXT) break;
        if (k == KEY_BKSP) {
            if (n > 0) buf[--n] = '\0';
            continue;
        }
        if (k < 32 || k > 126 || n >= len) continue;
        if ((flags & UI_DIGITS) && !isdigit(k)) continue;
        if ((flags & UI_MONEY) && !isdigit(k) && !(k == '.' && strchr(buf, '.') == NULL)) continue;
        if (flags & UI_UPPER) k = toupper(k);
        buf[n++] = (char)k;
        buf[n] = '\0';
    }
    scr_cursor_visible(0);
    return k;
}

int ui_wait(void)
{
    return kbd_get();
}

void ui_money(long paisa, char *out)
{
    unsigned long mag = paisa < 0 ? 0UL - (unsigned long)paisa : (unsigned long)paisa;
    sprintf(out, "%s%lu.%02lu", paisa < 0 ? "-" : "", mag / 100UL, mag % 100UL);
}
