/* Shared look and input fields for the sample apps: blue and white, 1990s style. */
#ifndef UI_H
#define UI_H

#define ATTR_BODY 0x1F   /* bright white on blue */
#define ATTR_TITLE 0x3F  /* bright white on cyan */
#define ATTR_HILITE 0x1E /* yellow on blue */
#define ATTR_FIELD 0x70  /* black on grey: an input field */
#define ATTR_ERROR 0x4F  /* bright white on red */
#define ATTR_HINT 0x30   /* black on cyan */

#define ROW_STATUS 23
#define ROW_HINT 24

#define UI_UPPER 1  /* turn letters to upper case */
#define UI_DIGITS 2 /* only accept 0-9 */
#define UI_MONEY 4  /* only accept 0-9 and one decimal point */

/* Clears to the body colour, draws the title bar (app name left, screen name centre, date right). */
void ui_frame(const char *app, const char *screen, const char *date);
void ui_hint(const char *text);
void ui_status(const char *msg, unsigned char attr);
void ui_status_clear(void);
/* Edits buf (len characters max) in a field at row, col. Ends on Enter, Esc or any extended key
 * (F1..F12, PgUp...), and returns that key. buf keeps its starting text. */
int ui_input(int row, int col, int len, char *buf, int flags);
/* Waits for any key and returns it. */
int ui_wait(void);
/* Right-aligns a paisa amount as rupees, for example 1234567L -> "12345.67". */
void ui_money(long paisa, char *out);

#endif
