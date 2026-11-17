/* Parser for key scripts, e.g. "1{Enter}PAN500{Enter}4{Enter}{F2}{Dump:SAVED}". Pure C89. */
#ifndef KBD_PARSE_H
#define KBD_PARSE_H

#define KBD_MAX_KEYS 1024
#define KBD_MAX_NAMES 32

typedef struct {
    int keys[KBD_MAX_KEYS];
    int nkeys;
    char names[KBD_MAX_NAMES][9]; /* screen dump names, up to 8 characters */
    int nnames;
    char error[48];
} KBD_SCRIPT;

/*
 * Plain characters (including spaces) are typed as they are. Line breaks are ignored, and lines
 * that start with # are comments. Named keys: {Enter} {Esc} {Tab} {Backspace} {F1}..{F12} {Up}
 * {Down} {Left} {Right} {PgUp} {PgDn} {Home} {End}. {Dump:NAME} saves the screen as NAME.SCR.
 * Returns 0, or -1 with out->error set.
 */
int kbd_parse(const char *text, KBD_SCRIPT *out);

#endif
