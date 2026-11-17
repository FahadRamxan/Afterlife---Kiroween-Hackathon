/*
 * Test-build keyboard: replays KEYS.TXT (see kbd_parse.h) and saves screen dumps.
 * On exit it writes EXIT.TXT: "OK" when every key was used, otherwise what went wrong.
 * If the script runs out while the app still wants a key, it saves END.SCR and exits with code 3,
 * so a scripted run can never hang.
 */
#include <stdio.h>
#include <stdlib.h>
#include "kbd.h"
#include "kbd_parse.h"
#include "screen.h"

static KBD_SCRIPT script;
static char text[8192];
static int loaded = 0;
static int pos = 0;

static void write_exit(const char *msg)
{
    FILE *fp = fopen("EXIT.TXT", "w");
    if (!fp) return;
    fputs(msg, fp);
    fputc('\n', fp);
    fclose(fp);
}

static void load(void)
{
    FILE *fp = fopen("KEYS.TXT", "rb");
    size_t n = 0;
    loaded = 1;
    if (fp) {
        n = fread(text, 1, sizeof text - 1, fp);
        fclose(fp);
    }
    text[n] = '\0';
    if (!fp || kbd_parse(text, &script) != 0) {
        write_exit(fp ? script.error : "KEYS.TXT MISSING");
        exit(4);
    }
}

int kbd_get(void)
{
    char name[13];
    if (!loaded) load();
    while (pos < script.nkeys) {
        int k = script.keys[pos++];
        if (k < KEY_DUMP) return k;
        sprintf(name, "%s.SCR", script.names[k - KEY_DUMP]);
        scr_dump(name);
    }
    scr_dump("END.SCR");
    write_exit("RAN OUT OF KEYS");
    exit(3);
    return 0;
}

void kbd_shutdown(void)
{
    char msg[32];
    if (!loaded) load();
    if (pos < script.nkeys) {
        sprintf(msg, "%d KEYS LEFT", script.nkeys - pos);
        write_exit(msg);
    } else {
        write_exit("OK");
    }
}
