/*
 * Keyboard input for the sample apps. Two implementations with the same interface:
 *   kbd_bios.c   the shipped EXE: reads the real keyboard
 *   kbd_script.c the test build: reads keys from KEYS.TXT and can dump the screen
 */
#ifndef KBD_H
#define KBD_H

#define KEY_BKSP 8
#define KEY_TAB 9
#define KEY_ENTER 13
#define KEY_ESC 27

/* Extended keys: 0x100 + the BIOS scan code. */
#define KEY_EXT 0x100
#define KEY_F1 (KEY_EXT + 59)
#define KEY_F2 (KEY_EXT + 60)
#define KEY_F3 (KEY_EXT + 61)
#define KEY_F4 (KEY_EXT + 62)
#define KEY_F5 (KEY_EXT + 63)
#define KEY_F6 (KEY_EXT + 64)
#define KEY_F7 (KEY_EXT + 65)
#define KEY_F8 (KEY_EXT + 66)
#define KEY_F9 (KEY_EXT + 67)
#define KEY_F10 (KEY_EXT + 68)
#define KEY_F11 (KEY_EXT + 133)
#define KEY_F12 (KEY_EXT + 134)
#define KEY_HOME (KEY_EXT + 71)
#define KEY_UP (KEY_EXT + 72)
#define KEY_PGUP (KEY_EXT + 73)
#define KEY_LEFT (KEY_EXT + 75)
#define KEY_RIGHT (KEY_EXT + 77)
#define KEY_END (KEY_EXT + 79)
#define KEY_DOWN (KEY_EXT + 80)
#define KEY_PGDN (KEY_EXT + 81)

/* Script only: KEY_DUMP + n means "save the screen as <name n>.SCR". Never returned by kbd_get. */
#define KEY_DUMP 0x1000

int kbd_get(void);
/* Call just before the program exits. The test build records whether every key was used. */
void kbd_shutdown(void);

#endif
