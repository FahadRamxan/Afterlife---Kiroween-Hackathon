/* dbf3: see dbf3.h. */
#include <ctype.h>
#include <string.h>
#include "dbf3.h"

#define HEADER_LEN 32
#define FIELD_LEN 32

static void put_u16(unsigned char *p, unsigned v)
{
    p[0] = (unsigned char)(v & 0xFF);
    p[1] = (unsigned char)((v >> 8) & 0xFF);
}

static void put_u32(unsigned char *p, unsigned long v)
{
    p[0] = (unsigned char)(v & 0xFFUL);
    p[1] = (unsigned char)((v >> 8) & 0xFFUL);
    p[2] = (unsigned char)((v >> 16) & 0xFFUL);
    p[3] = (unsigned char)((v >> 24) & 0xFFUL);
}

static unsigned get_u16(const unsigned char *p)
{
    return (unsigned)p[0] | ((unsigned)p[1] << 8);
}

static unsigned long get_u32(const unsigned char *p)
{
    return (unsigned long)p[0] | ((unsigned long)p[1] << 8) | ((unsigned long)p[2] << 16) |
           ((unsigned long)p[3] << 24);
}

static int valid_field(const DBF_FIELD *f)
{
    size_t n = strlen(f->name);
    if (n == 0 || n > 10 || f->len == 0) return 0;
    switch (f->type) {
    case 'C':
        return f->dec == 0;
    case 'N':
        /* dBASE III numerics are at most 19 wide, and need room for the point. */
        return f->len <= 19 && (f->dec == 0 || f->dec + 2 <= f->len);
    case 'D':
        return f->len == 8 && f->dec == 0;
    case 'L':
        return f->len == 1 && f->dec == 0;
    default:
        return 0;
    }
}

static int write_header(FILE *fp, unsigned long nrecs, unsigned hdrlen, unsigned reclen, int yy,
                        int mm, int dd)
{
    unsigned char h[HEADER_LEN];
    memset(h, 0, sizeof h);
    h[0] = 0x03;
    h[1] = (unsigned char)yy;
    h[2] = (unsigned char)mm;
    h[3] = (unsigned char)dd;
    put_u32(h + 4, nrecs);
    put_u16(h + 8, hdrlen);
    put_u16(h + 10, reclen);
    if (fseek(fp, 0L, SEEK_SET) != 0) return DBF_ERR_IO;
    return fwrite(h, 1, HEADER_LEN, fp) == HEADER_LEN ? DBF_OK : DBF_ERR_IO;
}

int dbf_create(const char *path, const DBF_FIELD *fields, int nfields, int yy, int mm, int dd)
{
    FILE *fp;
    unsigned char d[FIELD_LEN];
    unsigned reclen = 1;
    unsigned hdrlen;
    int i;
    int rc;

    if (nfields < 1 || nfields > DBF_MAX_FIELDS) return DBF_ERR_FIELD;
    for (i = 0; i < nfields; i++) {
        if (!valid_field(&fields[i])) return DBF_ERR_FIELD;
        reclen += fields[i].len;
    }
    if (reclen > DBF_MAX_RECLEN) return DBF_ERR_FIELD;
    hdrlen = HEADER_LEN + (unsigned)nfields * FIELD_LEN + 1;

    fp = fopen(path, "wb");
    if (!fp) return DBF_ERR_IO;
    rc = write_header(fp, 0UL, hdrlen, reclen, yy, mm, dd);
    for (i = 0; rc == DBF_OK && i < nfields; i++) {
        memset(d, 0, sizeof d);
        strncpy((char *)d, fields[i].name, 10);
        d[11] = (unsigned char)fields[i].type;
        d[16] = fields[i].len;
        d[17] = fields[i].dec;
        if (fwrite(d, 1, FIELD_LEN, fp) != FIELD_LEN) rc = DBF_ERR_IO;
    }
    if (rc == DBF_OK && (fputc(0x0D, fp) == EOF || fputc(0x1A, fp) == EOF)) rc = DBF_ERR_IO;
    if (fclose(fp) != 0 && rc == DBF_OK) rc = DBF_ERR_IO;
    return rc;
}

int dbf_open(DBF *db, const char *path)
{
    unsigned char h[HEADER_LEN];
    unsigned char d[FIELD_LEN];
    unsigned offset = 1;
    int i;

    memset(db, 0, sizeof *db);
    db->fp = fopen(path, "r+b");
    if (!db->fp) return DBF_ERR_IO;
    if (fread(h, 1, HEADER_LEN, db->fp) != HEADER_LEN || h[0] != 0x03) {
        fclose(db->fp);
        db->fp = NULL;
        return DBF_ERR_FORMAT;
    }
    db->yy = h[1];
    db->mm = h[2];
    db->dd = h[3];
    db->nrecs = get_u32(h + 4);
    db->hdrlen = get_u16(h + 8);
    db->reclen = get_u16(h + 10);
    db->nfields = (int)((db->hdrlen - HEADER_LEN - 1) / FIELD_LEN);
    if (db->nfields < 1 || db->nfields > DBF_MAX_FIELDS || db->reclen > DBF_MAX_RECLEN) {
        fclose(db->fp);
        db->fp = NULL;
        return DBF_ERR_FORMAT;
    }
    for (i = 0; i < db->nfields; i++) {
        if (fread(d, 1, FIELD_LEN, db->fp) != FIELD_LEN) {
            fclose(db->fp);
            db->fp = NULL;
            return DBF_ERR_FORMAT;
        }
        memcpy(db->fields[i].name, d, 10);
        db->fields[i].name[10] = '\0';
        db->fields[i].type = (char)d[11];
        db->fields[i].len = d[16];
        db->fields[i].dec = d[17];
        db->offset[i] = offset;
        offset += d[16];
    }
    return DBF_OK;
}

void dbf_close(DBF *db)
{
    if (!db->fp) return;
    if (db->dirty) write_header(db->fp, db->nrecs, db->hdrlen, db->reclen, db->yy, db->mm, db->dd);
    fclose(db->fp);
    db->fp = NULL;
}

static long record_pos(const DBF *db, unsigned long recno)
{
    return (long)db->hdrlen + (long)recno * (long)db->reclen;
}

int dbf_read(DBF *db, unsigned long recno, char *buf)
{
    if (recno >= db->nrecs) return DBF_ERR_RANGE;
    if (fseek(db->fp, record_pos(db, recno), SEEK_SET) != 0) return DBF_ERR_IO;
    return fread(buf, 1, db->reclen, db->fp) == db->reclen ? DBF_OK : DBF_ERR_IO;
}

int dbf_write(DBF *db, unsigned long recno, const char *buf)
{
    if (recno >= db->nrecs) return DBF_ERR_RANGE;
    if (fseek(db->fp, record_pos(db, recno), SEEK_SET) != 0) return DBF_ERR_IO;
    if (fwrite(buf, 1, db->reclen, db->fp) != db->reclen) return DBF_ERR_IO;
    db->dirty = 1;
    return fflush(db->fp) == 0 ? DBF_OK : DBF_ERR_IO;
}

int dbf_append(DBF *db, const char *buf)
{
    /* The new record goes where the 0x1A EOF byte was, then EOF is written after it. */
    if (fseek(db->fp, record_pos(db, db->nrecs), SEEK_SET) != 0) return DBF_ERR_IO;
    if (fwrite(buf, 1, db->reclen, db->fp) != db->reclen) return DBF_ERR_IO;
    if (fputc(0x1A, db->fp) == EOF) return DBF_ERR_IO;
    db->nrecs++;
    db->dirty = 1;
    /* Keep the record count on disk current, so a crash leaves a readable file. */
    if (write_header(db->fp, db->nrecs, db->hdrlen, db->reclen, db->yy, db->mm, db->dd) != DBF_OK)
        return DBF_ERR_IO;
    return fflush(db->fp) == 0 ? DBF_OK : DBF_ERR_IO;
}

int dbf_delete(DBF *db, unsigned long recno)
{
    if (recno >= db->nrecs) return DBF_ERR_RANGE;
    if (fseek(db->fp, record_pos(db, recno), SEEK_SET) != 0) return DBF_ERR_IO;
    if (fputc('*', db->fp) == EOF) return DBF_ERR_IO;
    db->dirty = 1;
    return fflush(db->fp) == 0 ? DBF_OK : DBF_ERR_IO;
}

int dbf_is_deleted(const char *buf)
{
    return buf[0] == '*';
}

void dbf_set_date(DBF *db, int yy, int mm, int dd)
{
    db->yy = yy;
    db->mm = mm;
    db->dd = dd;
    db->dirty = 1;
}

int dbf_field_index(const DBF *db, const char *name)
{
    int i;
    size_t k;
    for (i = 0; i < db->nfields; i++) {
        const char *f = db->fields[i].name;
        for (k = 0; f[k] && name[k]; k++)
            if (toupper((unsigned char)f[k]) != toupper((unsigned char)name[k])) break;
        if (f[k] == '\0' && name[k] == '\0') return i;
    }
    return -1;
}

void dbf_blank(const DBF *db, char *buf)
{
    memset(buf, ' ', db->reclen);
}

void dbf_get(const DBF *db, const char *buf, int field, char *out)
{
    unsigned len = db->fields[field].len;
    memcpy(out, buf + db->offset[field], len);
    while (len > 0 && out[len - 1] == ' ') len--;
    out[len] = '\0';
}

void dbf_put_str(const DBF *db, char *buf, int field, const char *s)
{
    unsigned len = db->fields[field].len;
    unsigned n = (unsigned)strlen(s);
    char *dst = buf + db->offset[field];
    if (n > len) n = len;
    memset(dst, ' ', len);
    memcpy(dst, s, n);
}

int dbf_put_num(const DBF *db, char *buf, int field, long scaled)
{
    char tmp[24];
    char *p = tmp + sizeof tmp;
    unsigned len = db->fields[field].len;
    unsigned dec = db->fields[field].dec;
    unsigned long mag = scaled < 0 ? 0UL - (unsigned long)scaled : (unsigned long)scaled;
    unsigned digits = 0;
    unsigned n;

    /* Build the text right to left: decimals, point, integer part, sign. */
    do {
        *--p = (char)('0' + (int)(mag % 10UL));
        mag /= 10UL;
        digits++;
        if (dec > 0 && digits == dec) *--p = '.';
    } while (mag > 0UL || digits <= dec);
    if (scaled < 0) *--p = '-';

    n = (unsigned)(tmp + sizeof tmp - p);
    if (n > len) return DBF_ERR_WIDTH;
    memset(buf + db->offset[field], ' ', len - n);
    memcpy(buf + db->offset[field] + (len - n), p, n);
    return DBF_OK;
}

long dbf_get_num(const DBF *db, const char *buf, int field)
{
    const char *p = buf + db->offset[field];
    const char *end = p + db->fields[field].len;
    unsigned dec = db->fields[field].dec;
    unsigned seen = 0;
    int after_point = 0;
    int negative = 0;
    long v = 0L;

    for (; p < end; p++) {
        if (*p == '-') negative = 1;
        else if (*p == '.') after_point = 1;
        else if (*p >= '0' && *p <= '9') {
            if (after_point && seen >= dec) continue;
            v = v * 10L + (long)(*p - '0');
            if (after_point) seen++;
        }
    }
    for (; seen < dec; seen++) v *= 10L;
    return negative ? -v : v;
}
