/* See kbd_parse.h. */
#include <stdio.h>
#include <string.h>
#include "kbd.h"
#include "kbd_parse.h"

static const struct {
    const char *name;
    int key;
} NAMED[] = {{"Enter", KEY_ENTER}, {"Esc", KEY_ESC},     {"Tab", KEY_TAB},     {"Backspace", KEY_BKSP},
             {"F1", KEY_F1},       {"F2", KEY_F2},       {"F3", KEY_F3},       {"F4", KEY_F4},
             {"F5", KEY_F5},       {"F6", KEY_F6},       {"F7", KEY_F7},       {"F8", KEY_F8},
             {"F9", KEY_F9},       {"F10", KEY_F10},     {"F11", KEY_F11},     {"F12", KEY_F12},
             {"Up", KEY_UP},       {"Down", KEY_DOWN},   {"Left", KEY_LEFT},   {"Right", KEY_RIGHT},
             {"PgUp", KEY_PGUP},   {"PgDn", KEY_PGDN},   {"Home", KEY_HOME},   {"End", KEY_END}};

static int push(KBD_SCRIPT *out, int key)
{
    if (out->nkeys >= KBD_MAX_KEYS) {
        strcpy(out->error, "too many keys");
        return -1;
    }
    out->keys[out->nkeys++] = key;
    return 0;
}

static int dump_name(KBD_SCRIPT *out, const char *name)
{
    int i;
    size_t n = strlen(name);
    if (n == 0 || n > 8) {
        strcpy(out->error, "dump name must be 1 to 8 characters");
        return -1;
    }
    for (i = 0; name[i]; i++) {
        char c = name[i];
        if (!((c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' || c == '_')) {
            strcpy(out->error, "dump name: use A-Z, 0-9, - or _");
            return -1;
        }
    }
    for (i = 0; i < out->nnames; i++)
        if (strcmp(out->names[i], name) == 0) return push(out, KEY_DUMP + i);
    if (out->nnames >= KBD_MAX_NAMES) {
        strcpy(out->error, "too many dump names");
        return -1;
    }
    strcpy(out->names[out->nnames], name);
    return push(out, KEY_DUMP + out->nnames++);
}

int kbd_parse(const char *text, KBD_SCRIPT *out)
{
    const char *p = text;
    int at_line_start = 1;
    out->nkeys = 0;
    out->nnames = 0;
    out->error[0] = '\0';

    while (*p) {
        if (*p == '\r' || *p == '\n') {
            at_line_start = 1;
            p++;
            continue;
        }
        if (at_line_start && *p == '#') {
            while (*p && *p != '\n') p++;
            continue;
        }
        at_line_start = 0;
        if (*p == '{') {
            char token[24];
            size_t n = 0;
            size_t i;
            int found = 0;
            p++;
            while (*p && *p != '}' && n < sizeof token - 1) token[n++] = *p++;
            token[n] = '\0';
            if (*p != '}') {
                sprintf(out->error, "missing } after {%.16s", token);
                return -1;
            }
            p++;
            if (strncmp(token, "Dump:", 5) == 0) {
                if (dump_name(out, token + 5) != 0) return -1;
                continue;
            }
            for (i = 0; i < sizeof NAMED / sizeof NAMED[0]; i++) {
                if (strcmp(token, NAMED[i].name) == 0) {
                    if (push(out, NAMED[i].key) != 0) return -1;
                    found = 1;
                    break;
                }
            }
            if (!found) {
                sprintf(out->error, "unknown key {%.16s}", token);
                return -1;
            }
            continue;
        }
        if (push(out, (unsigned char)*p) != 0) return -1;
        p++;
    }
    return 0;
}
