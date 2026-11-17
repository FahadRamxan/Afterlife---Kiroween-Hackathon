/*
 * dbf3: a tiny dBASE III .DBF reader and writer for the Afterlife sample DOS apps.
 * C89, works with 16-bit Open Watcom (int is 16 bits there, so counts and numbers use long).
 *
 * File layout (dBASE III, no memo):
 *   32-byte header: 0x03, YY MM DD (year - 1900), record count (uint32 LE),
 *                   header length (uint16 LE), record length (uint16 LE), 20 reserved bytes
 *   32 bytes per field: name (11, NUL padded), type, 4 reserved, length, decimals, 14 reserved
 *   0x0D, then fixed-width records (' ' or '*' deletion flag, then the fields), then 0x1A.
 *
 * Numbers are passed as scaled longs: value * 10^decimals. 45.50 in N(8,2) is 4550L.
 */
#ifndef DBF3_H
#define DBF3_H

#include <stdio.h>

#define DBF_MAX_FIELDS 32
#define DBF_MAX_RECLEN 1024

#define DBF_OK 0
#define DBF_ERR_IO -1     /* file missing, short read or write */
#define DBF_ERR_FORMAT -2 /* not a dBASE III file */
#define DBF_ERR_RANGE -3  /* record number past the end */
#define DBF_ERR_WIDTH -4  /* number does not fit the field */
#define DBF_ERR_FIELD -5  /* bad field definition */

typedef struct {
    char name[11]; /* up to 10 characters plus NUL */
    char type;     /* 'C' character, 'N' numeric, 'D' date (YYYYMMDD), 'L' logical */
    unsigned char len;
    unsigned char dec;
} DBF_FIELD;

typedef struct {
    FILE *fp;
    int nfields;
    DBF_FIELD fields[DBF_MAX_FIELDS];
    unsigned offset[DBF_MAX_FIELDS]; /* byte offset of each field inside a record */
    unsigned long nrecs;
    unsigned hdrlen;
    unsigned reclen;
    int yy, mm, dd; /* last update date from the header */
    int dirty;      /* header must be rewritten on close */
} DBF;

/* Creates an empty table. yy is the year minus 1900 (98 for 1998). */
int dbf_create(const char *path, const DBF_FIELD *fields, int nfields, int yy, int mm, int dd);
int dbf_open(DBF *db, const char *path);
void dbf_close(DBF *db);

/* Record numbers start at 0. buf holds db->reclen bytes, deletion flag first. */
int dbf_read(DBF *db, unsigned long recno, char *buf);
int dbf_write(DBF *db, unsigned long recno, const char *buf);
int dbf_append(DBF *db, const char *buf);
int dbf_delete(DBF *db, unsigned long recno);
int dbf_is_deleted(const char *buf);

/* Sets the last update date written on close. */
void dbf_set_date(DBF *db, int yy, int mm, int dd);

/* Field helpers. Field indexes start at 0. Names match case-insensitively. */
int dbf_field_index(const DBF *db, const char *name);
void dbf_blank(const DBF *db, char *buf);
/* Copies a field into out (len + 1 bytes), with trailing spaces trimmed. */
void dbf_get(const DBF *db, const char *buf, int field, char *out);
/* Left-aligned, space padded, cut to the field width. */
void dbf_put_str(const DBF *db, char *buf, int field, const char *s);
/* Right-aligned with the field's decimals. Returns DBF_ERR_WIDTH and leaves the field as it was
 * if the number does not fit. */
int dbf_put_num(const DBF *db, char *buf, int field, long scaled);
/* Parses a numeric field into a scaled long. Blank fields are 0. */
long dbf_get_num(const DBF *db, const char *buf, int field);

#endif
