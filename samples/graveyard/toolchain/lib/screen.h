/* 80x25 colour text mode, written straight to video memory (B800:0000), like 1990s apps did. */
#ifndef SCREEN_H
#define SCREEN_H

#define SCR_ROWS 25
#define SCR_COLS 80

void scr_init(void); /* text mode 3, clear */
void scr_done(void); /* grey on black, cursor home: back to DOS */
void scr_clear(unsigned char attr);
void scr_fill(int row, int col, int len, unsigned char attr, char ch);
void scr_put(int row, int col, unsigned char attr, const char *s);
/* Writes s cut or space padded to exactly width cells. */
void scr_putw(int row, int col, unsigned char attr, const char *s, int width);
void scr_cursor(int row, int col);
void scr_cursor_visible(int on);
/* Saves the screen as text: 25 lines, "--ATTR--", then 25 lines of 80 two-digit hex attributes. */
int scr_dump(const char *path);

#endif
