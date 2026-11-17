/* See screen.h. Watcom C, 16-bit DOS only. */
#include <i86.h>
#include <stdio.h>
#include "screen.h"

#define CELL(row, col) (video[(row) * SCR_COLS + (col)])

static unsigned short __far *video = (unsigned short __far *)MK_FP(0xB800, 0);

void scr_init(void)
{
    union REGS r;
    r.w.ax = 0x0003; /* 80x25 colour text */
    int86(0x10, &r, &r);
}

void scr_done(void)
{
    scr_clear(0x07);
    scr_cursor(0, 0);
    scr_cursor_visible(1);
}

void scr_clear(unsigned char attr)
{
    int i;
    for (i = 0; i < SCR_ROWS * SCR_COLS; i++) video[i] = (unsigned short)((attr << 8) | ' ');
}

void scr_fill(int row, int col, int len, unsigned char attr, char ch)
{
    int i;
    for (i = 0; i < len && col + i < SCR_COLS; i++)
        CELL(row, col + i) = (unsigned short)((attr << 8) | (unsigned char)ch);
}

void scr_put(int row, int col, unsigned char attr, const char *s)
{
    for (; *s && col < SCR_COLS; s++, col++) CELL(row, col) = (unsigned short)((attr << 8) | (unsigned char)*s);
}

void scr_putw(int row, int col, unsigned char attr, const char *s, int width)
{
    int i;
    for (i = 0; i < width && col + i < SCR_COLS; i++) {
        unsigned char c = (unsigned char)(*s ? *s++ : ' ');
        CELL(row, col + i) = (unsigned short)((attr << 8) | c);
    }
}

void scr_cursor(int row, int col)
{
    union REGS r;
    r.h.ah = 0x02;
    r.h.bh = 0;
    r.h.dh = (unsigned char)row;
    r.h.dl = (unsigned char)col;
    int86(0x10, &r, &r);
}

void scr_cursor_visible(int on)
{
    union REGS r;
    r.h.ah = 0x01;
    r.w.cx = on ? 0x0607 : 0x2000;
    int86(0x10, &r, &r);
}

int scr_dump(const char *path)
{
    static const char hex[] = "0123456789ABCDEF";
    FILE *fp = fopen(path, "w");
    int row, col, end;
    if (!fp) return -1;
    for (row = 0; row < SCR_ROWS; row++) {
        for (end = SCR_COLS; end > 0 && (CELL(row, end - 1) & 0xFF) == ' '; end--)
            ;
        for (col = 0; col < end; col++) fputc(CELL(row, col) & 0xFF, fp);
        fputc('\n', fp);
    }
    fputs("--ATTR--\n", fp);
    for (row = 0; row < SCR_ROWS; row++) {
        for (col = 0; col < SCR_COLS; col++) {
            unsigned a = (CELL(row, col) >> 8) & 0xFF;
            fputc(hex[a >> 4], fp);
            fputc(hex[a & 15], fp);
        }
        fputc('\n', fp);
    }
    return fclose(fp);
}
