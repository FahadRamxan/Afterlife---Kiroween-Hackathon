/* The shipped keyboard: reads the real keyboard through the C library (BIOS INT 16h). */
#include <conio.h>
#include "kbd.h"

int kbd_get(void)
{
    int c = getch();
    /* Extended keys come as 0 (or 0xE0) followed by the scan code. */
    if (c == 0 || c == 0xE0) return KEY_EXT + getch();
    return c;
}

void kbd_shutdown(void)
{
}
