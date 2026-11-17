/*
 * The smallest sample: proves the toolchain end to end. Writes HELLO.DBF with dbf3, reads it back
 * and prints what it read. toolchain/test.sh runs it in DOSBox and keeps the output as a fixture.
 */
#include <dos.h>
#include <stdio.h>
#include "dbf3.h"

static const DBF_FIELD fields[2] = {{"CODE", 'C', 6, 0}, {"PRICE", 'N', 8, 2}};

static int add(DBF *db, const char *code, long price)
{
    char rec[DBF_MAX_RECLEN];
    dbf_blank(db, rec);
    dbf_put_str(db, rec, 0, code);
    if (dbf_put_num(db, rec, 1, price) != DBF_OK) return DBF_ERR_WIDTH;
    return dbf_append(db, rec);
}

int main(void)
{
    struct dosdate_t today;
    DBF db;
    char rec[DBF_MAX_RECLEN];
    char code[8];
    char price[12];
    unsigned long i;

    printf("HELLO FROM 1998\n");
    _dos_getdate(&today);
    if (dbf_create("HELLO.DBF", fields, 2, today.year - 1900, today.month, today.day) != DBF_OK ||
        dbf_open(&db, "HELLO.DBF") != DBF_OK) {
        printf("CANNOT CREATE HELLO.DBF\n");
        return 1;
    }
    if (add(&db, "PAN500", 4550L) != DBF_OK || add(&db, "ASP100", 1200L) != DBF_OK) {
        printf("CANNOT WRITE\n");
        return 1;
    }
    printf("WROTE %lu RECORDS\n", db.nrecs);
    dbf_close(&db);

    if (dbf_open(&db, "HELLO.DBF") != DBF_OK) return 1;
    printf("READ %lu RECORDS:", db.nrecs);
    for (i = 0; i < db.nrecs; i++) {
        long p;
        if (dbf_read(&db, i, rec) != DBF_OK) return 1;
        dbf_get(&db, rec, 0, code);
        p = dbf_get_num(&db, rec, 1);
        sprintf(price, "%ld.%02ld", p / 100L, p % 100L);
        printf("%s %s %s", i ? "," : "", code, price);
    }
    printf("\n");
    dbf_close(&db);
    return 0;
}
