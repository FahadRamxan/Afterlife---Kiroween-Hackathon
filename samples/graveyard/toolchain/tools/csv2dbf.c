/*
 * csv2dbf <in.csv> <out.dbf> <YYMMDD>: builds a dBASE III file from our seed CSV format.
 *   - lines starting with # are comments
 *   - the first line is the header: NAME:TYPE:LEN for C, D and L, NAME:TYPE:LEN:DEC for N
 *   - a first column named _DEL (written by dbf2csv) holds "*" for deleted records
 *   - values cannot contain commas
 * Host tool (gcc), used by build.sh. Exits 1 with the line number on any bad value.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "dbf3.h"

#define MAX_LINE 1024

static int lineno = 0;

static void fail(const char *msg, const char *detail)
{
    fprintf(stderr, "csv2dbf: line %d: %s %s\n", lineno, msg, detail ? detail : "");
    exit(1);
}

static int split(char *line, char **cols, int max)
{
    int n = 0;
    char *p = line;
    cols[n++] = p;
    for (; *p; p++) {
        if (*p == ',') {
            *p = '\0';
            if (n >= max) fail("too many columns", NULL);
            cols[n++] = p + 1;
        }
    }
    return n;
}

/* "45.50" in a field with 2 decimals -> 4550. Rejects anything that is not a plain number with
 * exactly the field's number of decimals, so the CSV round-trips byte for byte. */
static long parse_num(const char *s, int dec)
{
    const char *p = s;
    long v = 0L;
    int neg = 0;
    int digits = 0;
    int seen_dec = -1;
    if (*p == '-') {
        neg = 1;
        p++;
    }
    for (; *p; p++) {
        if (*p == '.' && seen_dec < 0 && dec > 0) {
            seen_dec = 0;
        } else if (*p >= '0' && *p <= '9') {
            v = v * 10L + (*p - '0');
            digits++;
            if (seen_dec >= 0) seen_dec++;
        } else {
            fail("not a number:", s);
        }
    }
    if (digits == 0 || (dec > 0 && seen_dec != dec) || (dec == 0 && seen_dec >= 0))
        fail("number must have exactly the field's decimals:", s);
    return neg ? -v : v;
}

int main(int argc, char **argv)
{
    FILE *in;
    char line[MAX_LINE];
    char *cols[DBF_MAX_FIELDS + 1];
    DBF_FIELD fields[DBF_MAX_FIELDS];
    DBF db;
    char rec[DBF_MAX_RECLEN];
    int ncols = 0, nfields = 0, has_del = 0, header = 0, i, yy, mm, dd;

    if (argc != 4 || strlen(argv[3]) != 6) {
        fprintf(stderr, "usage: csv2dbf <in.csv> <out.dbf> <YYMMDD>\n");
        return 2;
    }
    yy = (argv[3][0] - '0') * 10 + (argv[3][1] - '0');
    mm = (argv[3][2] - '0') * 10 + (argv[3][3] - '0');
    dd = (argv[3][4] - '0') * 10 + (argv[3][5] - '0');
    in = fopen(argv[1], "r");
    if (!in) fail("cannot open", argv[1]);

    while (fgets(line, sizeof line, in)) {
        size_t n = strlen(line);
        lineno++;
        while (n > 0 && (line[n - 1] == '\n' || line[n - 1] == '\r')) line[--n] = '\0';
        if (n == 0 || line[0] == '#') continue;
        if (!header) {
            header = 1;
            ncols = split(line, cols, DBF_MAX_FIELDS + 1);
            for (i = 0; i < ncols; i++) {
                char *name = cols[i], *type, *len, *dec;
                if (i == 0 && strncmp(name, "_DEL:", 5) == 0) {
                    has_del = 1;
                    continue;
                }
                type = strchr(name, ':');
                if (!type) fail("header needs NAME:TYPE:LEN:", name);
                *type++ = '\0';
                len = strchr(type, ':');
                if (!len) fail("header needs NAME:TYPE:LEN:", name);
                *len++ = '\0';
                dec = strchr(len, ':');
                if (dec) *dec++ = '\0';
                memset(&fields[nfields], 0, sizeof fields[nfields]);
                strncpy(fields[nfields].name, name, 10);
                fields[nfields].type = type[0];
                fields[nfields].len = (unsigned char)atoi(len);
                fields[nfields].dec = (unsigned char)(dec ? atoi(dec) : 0);
                nfields++;
            }
            if (dbf_create(argv[2], fields, nfields, yy, mm, dd) != DBF_OK) fail("bad field list", NULL);
            if (dbf_open(&db, argv[2]) != DBF_OK) fail("cannot open", argv[2]);
            continue;
        }
        if (split(line, cols, DBF_MAX_FIELDS + 1) != ncols) fail("wrong number of columns", NULL);
        dbf_blank(&db, rec);
        for (i = 0; i < nfields; i++) {
            const char *v = cols[i + has_del];
            if (strlen(v) > fields[i].len) fail("value too long:", v);
            if (fields[i].type == 'N') {
                if (*v && dbf_put_num(&db, rec, i, parse_num(v, fields[i].dec)) != DBF_OK)
                    fail("number does not fit:", v);
            } else if (fields[i].type == 'D' && *v && strlen(v) != 8) {
                fail("date must be YYYYMMDD:", v);
            } else {
                dbf_put_str(&db, rec, i, v);
            }
        }
        if (has_del && strcmp(cols[0], "*") == 0) rec[0] = '*';
        if (dbf_append(&db, rec) != DBF_OK) fail("cannot write", argv[2]);
    }
    if (!header) fail("no header line", NULL);
    /* dbf_append keeps the header current; keep the requested date, not today. */
    dbf_set_date(&db, yy, mm, dd);
    dbf_close(&db);
    fclose(in);
    return 0;
}
