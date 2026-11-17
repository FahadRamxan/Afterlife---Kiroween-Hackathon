/*
 * Unit tests for lib/kbd_parse.c, the key-script parser used by the scripted test builds.
 * SOURCES: toolchain/lib/kbd_parse.c
 */
#include <stdio.h>
#include <string.h>
#include "kbd.h"
#include "kbd_parse.h"

static int checks = 0;
static int failures = 0;
static KBD_SCRIPT s;

#define CHECK(cond)                                                \
    do {                                                           \
        checks++;                                                  \
        if (!(cond)) {                                             \
            failures++;                                            \
            printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond); \
        }                                                          \
    } while (0)

static void test_plain_and_named_keys(void)
{
    CHECK(kbd_parse("1{Enter}PAN500{Tab}2{F2}", &s) == 0);
    /* 1, Enter, P A N 5 0 0, Tab, 2, F2 */
    CHECK(s.nkeys == 11);
    CHECK(s.keys[0] == '1' && s.keys[1] == KEY_ENTER && s.keys[2] == 'P');
    CHECK(s.keys[8] == KEY_TAB && s.keys[9] == '2' && s.keys[10] == KEY_F2);
}

static void test_all_named_keys(void)
{
    CHECK(kbd_parse("{Esc}{Backspace}{F1}{F3}{F10}{F11}{F12}{Up}{Down}{Left}{Right}"
                    "{PgUp}{PgDn}{Home}{End}",
                    &s) == 0);
    CHECK(s.nkeys == 15);
    CHECK(s.keys[0] == KEY_ESC && s.keys[1] == KEY_BKSP && s.keys[2] == KEY_F1);
    CHECK(s.keys[3] == KEY_F3 && s.keys[4] == KEY_F10 && s.keys[5] == KEY_F11);
    CHECK(s.keys[6] == KEY_F12 && s.keys[7] == KEY_UP && s.keys[8] == KEY_DOWN);
    CHECK(s.keys[9] == KEY_LEFT && s.keys[10] == KEY_RIGHT && s.keys[11] == KEY_PGUP);
    CHECK(s.keys[12] == KEY_PGDN && s.keys[13] == KEY_HOME && s.keys[14] == KEY_END);
}

static void test_spaces_newlines_comments(void)
{
    /* Spaces are typed. Line breaks are not. Lines starting with # are comments. */
    CHECK(kbd_parse("# a comment\r\nALI RAZA\r\n{Enter}\n# another\n5", &s) == 0);
    CHECK(s.nkeys == 10);
    CHECK(s.keys[3] == ' ' && s.keys[8] == KEY_ENTER && s.keys[9] == '5');
}

static void test_dump(void)
{
    CHECK(kbd_parse("1{Dump:MENU}2{Dump:STOCK1}{Dump:MENU}", &s) == 0);
    CHECK(s.nkeys == 5);
    CHECK(s.nnames == 2);
    CHECK(strcmp(s.names[0], "MENU") == 0 && strcmp(s.names[1], "STOCK1") == 0);
    CHECK(s.keys[1] == KEY_DUMP + 0 && s.keys[3] == KEY_DUMP + 1 && s.keys[4] == KEY_DUMP + 0);
}

static void test_errors(void)
{
    CHECK(kbd_parse("{Nope}", &s) == -1);
    CHECK(strstr(s.error, "Nope") != NULL);
    CHECK(kbd_parse("{Enter", &s) == -1);
    CHECK(kbd_parse("{Dump:}", &s) == -1);
    CHECK(kbd_parse("{Dump:TOOLONGNAME}", &s) == -1);
    CHECK(kbd_parse("{Dump:a.b}", &s) == -1);
    CHECK(kbd_parse("", &s) == 0 && s.nkeys == 0);
}

int main(void)
{
    test_plain_and_named_keys();
    test_all_named_keys();
    test_spaces_newlines_comments();
    test_dump();
    test_errors();
    if (failures) {
        printf("%d OF %d CHECKS FAILED\n", failures, checks);
        return 1;
    }
    printf("ALL %d CHECKS PASSED\n", checks);
    return 0;
}
