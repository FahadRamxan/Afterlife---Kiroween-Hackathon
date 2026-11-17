/*
 * dbf2csv <in.dbf>: prints a dBASE III file in our CSV format (see csv2dbf.c), so test fixtures
 * and diffs are readable. A _DEL column is added only when the file has deleted records.
 * Numeric values are printed exactly as stored, without padding. Host tool (gcc).
 */
#include <stdio.h>
#include <string.h>
#include "dbf3.h"

int main(int argc, char **argv)
{
    DBF db;
    char rec[DBF_MAX_RECLEN];
    char val[256];
    unsigned long r;
    int i, has_del = 0;

    if (argc != 2) {
        fprintf(stderr, "usage: dbf2csv <in.dbf>\n");
        return 2;
    }
    if (dbf_open(&db, argv[1]) != DBF_OK) {
        fprintf(stderr, "dbf2csv: cannot read %s\n", argv[1]);
        return 1;
    }
    for (r = 0; r < db.nrecs; r++)
        if (dbf_read(&db, r, rec) == DBF_OK && dbf_is_deleted(rec)) has_del = 1;

    printf("#updated %04d-%02d-%02d records=%lu\n", 1900 + db.yy, db.mm, db.dd, db.nrecs);
    if (has_del) printf("_DEL:L:1,");
    for (i = 0; i < db.nfields; i++) {
        const DBF_FIELD *f = &db.fields[i];
        if (f->type == 'N') printf("%s%s:N:%u:%u", i ? "," : "", f->name, f->len, f->dec);
        else printf("%s%s:%c:%u", i ? "," : "", f->name, f->type, f->len);
    }
    printf("\n");
    for (r = 0; r < db.nrecs; r++) {
        if (dbf_read(&db, r, rec) != DBF_OK) {
            fprintf(stderr, "dbf2csv: cannot read record %lu\n", r);
            return 1;
        }
        if (has_del) printf("%s,", dbf_is_deleted(rec) ? "*" : "");
        for (i = 0; i < db.nfields; i++) {
            char *v = val;
            dbf_get(&db, rec, i, val);
            if (db.fields[i].type == 'N')
                while (*v == ' ') v++;
            printf("%s%s", i ? "," : "", v);
        }
        printf("\n");
    }
    dbf_close(&db);
    return 0;
}
