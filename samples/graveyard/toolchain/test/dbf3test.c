/*
 * Unit tests for lib/dbf3.c. Built twice by toolchain/test.sh:
 *   - with gcc on Linux (fast feedback)
 *   - with Open Watcom for 16-bit DOS and run in DOSBox, where int is 16 bits
 * Prints "ALL n TESTS PASSED" on success. Exit code 0 only if every check passed.
 */
#include <stdio.h>
#include <string.h>
#include "dbf3.h"

static int checks = 0;
static int failures = 0;

#define CHECK(cond)                                                        \
    do {                                                                   \
        checks++;                                                          \
        if (!(cond)) {                                                     \
            failures++;                                                    \
            printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond);         \
        }                                                                  \
    } while (0)

static long file_size(const char *path)
{
    FILE *fp = fopen(path, "rb");
    long n;
    if (!fp) return -1L;
    fseek(fp, 0L, SEEK_END);
    n = ftell(fp);
    fclose(fp);
    return n;
}

static int read_bytes(const char *path, unsigned char *buf, int n)
{
    FILE *fp = fopen(path, "rb");
    int got;
    if (!fp) return -1;
    got = (int)fread(buf, 1, (size_t)n, fp);
    fclose(fp);
    return got;
}

static const DBF_FIELD fields[3] = {
    {"CODE", 'C', 6, 0},
    {"PRICE", 'N', 8, 2},
    {"EXPIRY", 'D', 8, 0}
};

static void test_create_empty(void)
{
    unsigned char h[64];
    CHECK(dbf_create("T1.DBF", fields, 3, 98, 7, 15) == DBF_OK);
    /* header 32 + 3 * 32 + terminator 1 = 129, plus the 0x1A EOF byte */
    CHECK(file_size("T1.DBF") == 130L);
    CHECK(read_bytes("T1.DBF", h, 64) == 64);
    CHECK(h[0] == 0x03);
    CHECK(h[1] == 98 && h[2] == 7 && h[3] == 15);
    CHECK(h[4] == 0 && h[5] == 0 && h[6] == 0 && h[7] == 0);
    CHECK(h[8] == 129 && h[9] == 0);
    CHECK(h[10] == 23 && h[11] == 0); /* 1 + 6 + 8 + 8 */
    CHECK(memcmp(h + 32, "CODE\0\0\0\0\0\0\0", 11) == 0);
    CHECK(h[32 + 11] == 'C' && h[32 + 16] == 6 && h[32 + 17] == 0);
}

static void test_append_and_read(void)
{
    DBF db;
    char rec[DBF_MAX_RECLEN];
    char out[32];
    unsigned char tail[1];
    FILE *fp;

    CHECK(dbf_create("T2.DBF", fields, 3, 98, 1, 2) == DBF_OK);
    CHECK(dbf_open(&db, "T2.DBF") == DBF_OK);
    CHECK(db.nfields == 3);
    CHECK(db.hdrlen == 129);
    CHECK(db.reclen == 23);
    CHECK(db.nrecs == 0L);
    CHECK(dbf_field_index(&db, "PRICE") == 1);
    CHECK(dbf_field_index(&db, "price") == 1);
    CHECK(dbf_field_index(&db, "NOPE") == -1);

    dbf_blank(&db, rec);
    dbf_put_str(&db, rec, 0, "PAN500");
    CHECK(dbf_put_num(&db, rec, 1, 4550L) == DBF_OK); /* 45.50 */
    dbf_put_str(&db, rec, 2, "19991231");
    CHECK(dbf_append(&db, rec) == DBF_OK);

    dbf_blank(&db, rec);
    dbf_put_str(&db, rec, 0, "AB"); /* shorter than the field: padded with spaces */
    CHECK(dbf_put_num(&db, rec, 1, -125L) == DBF_OK); /* -1.25 */
    CHECK(dbf_append(&db, rec) == DBF_OK);
    CHECK(db.nrecs == 2L);
    dbf_close(&db);

    /* 129 header + 2 * 23 records + 1 EOF */
    CHECK(file_size("T2.DBF") == 176L);
    fp = fopen("T2.DBF", "rb");
    fseek(fp, -1L, SEEK_END);
    CHECK(fread(tail, 1, 1, fp) == 1 && tail[0] == 0x1A);
    fclose(fp);

    CHECK(dbf_open(&db, "T2.DBF") == DBF_OK);
    CHECK(db.nrecs == 2L);
    CHECK(dbf_read(&db, 0L, rec) == DBF_OK);
    CHECK(rec[0] == ' ');
    CHECK(memcmp(rec + 1, "PAN500   45.5019991231", 22) == 0);
    dbf_get(&db, rec, 0, out);
    CHECK(strcmp(out, "PAN500") == 0);
    CHECK(dbf_get_num(&db, rec, 1) == 4550L);

    CHECK(dbf_read(&db, 1L, rec) == DBF_OK);
    dbf_get(&db, rec, 0, out);
    CHECK(strcmp(out, "AB") == 0); /* trailing spaces trimmed */
    CHECK(memcmp(rec + 7, "   -1.25", 8) == 0);
    CHECK(dbf_get_num(&db, rec, 1) == -125L);
    dbf_get(&db, rec, 2, out);
    CHECK(strcmp(out, "") == 0); /* empty date */

    CHECK(dbf_read(&db, 2L, rec) == DBF_ERR_RANGE);
    dbf_close(&db);
}

static void test_numbers(void)
{
    DBF db;
    char rec[DBF_MAX_RECLEN];
    CHECK(dbf_open(&db, "T2.DBF") == DBF_OK);
    dbf_blank(&db, rec);
    /* N(8,2) holds at most 99999.99 */
    CHECK(dbf_put_num(&db, rec, 1, 9999999L) == DBF_OK);
    CHECK(memcmp(rec + 7, "99999.99", 8) == 0);
    CHECK(dbf_get_num(&db, rec, 1) == 9999999L);
    CHECK(dbf_put_num(&db, rec, 1, 10000000L) == DBF_ERR_WIDTH);
    CHECK(dbf_put_num(&db, rec, 1, -999999L) == DBF_OK); /* -9999.99 */
    CHECK(dbf_put_num(&db, rec, 1, -1000000L) == DBF_ERR_WIDTH);
    CHECK(dbf_put_num(&db, rec, 1, 0L) == DBF_OK);
    CHECK(memcmp(rec + 7, "    0.00", 8) == 0);
    CHECK(dbf_put_num(&db, rec, 1, 5L) == DBF_OK);
    CHECK(memcmp(rec + 7, "    0.05", 8) == 0);
    CHECK(dbf_get_num(&db, rec, 1) == 5L);
    /* A value larger than a 16-bit int must survive (DOS int is 16 bits). */
    CHECK(dbf_put_num(&db, rec, 1, 1234567L) == DBF_OK);
    CHECK(dbf_get_num(&db, rec, 1) == 1234567L);
    /* The field is untouched after a rejected write. */
    CHECK(dbf_put_num(&db, rec, 1, 99999999L) == DBF_ERR_WIDTH);
    CHECK(dbf_get_num(&db, rec, 1) == 1234567L);
    dbf_close(&db);
}

static void test_update_and_delete(void)
{
    DBF db;
    char rec[DBF_MAX_RECLEN];
    CHECK(dbf_open(&db, "T2.DBF") == DBF_OK);
    CHECK(dbf_read(&db, 1L, rec) == DBF_OK);
    dbf_put_str(&db, rec, 0, "XYZ123");
    CHECK(dbf_write(&db, 1L, rec) == DBF_OK);
    CHECK(dbf_delete(&db, 0L) == DBF_OK);
    dbf_set_date(&db, 99, 12, 31);
    dbf_close(&db);

    CHECK(dbf_open(&db, "T2.DBF") == DBF_OK);
    CHECK(db.nrecs == 2L);
    CHECK(db.yy == 99 && db.mm == 12 && db.dd == 31);
    CHECK(dbf_read(&db, 0L, rec) == DBF_OK);
    CHECK(rec[0] == '*');
    CHECK(dbf_is_deleted(rec));
    CHECK(dbf_read(&db, 1L, rec) == DBF_OK);
    CHECK(!dbf_is_deleted(rec));
    CHECK(memcmp(rec + 1, "XYZ123", 6) == 0);
    dbf_close(&db);
    CHECK(file_size("T2.DBF") == 176L);
}

static void test_many_records(void)
{
    /* 300 records: the count needs more than one header byte. */
    DBF db;
    char rec[DBF_MAX_RECLEN];
    unsigned char h[8];
    int i;
    CHECK(dbf_create("T3.DBF", fields, 3, 98, 1, 1) == DBF_OK);
    CHECK(dbf_open(&db, "T3.DBF") == DBF_OK);
    for (i = 0; i < 300; i++) {
        dbf_blank(&db, rec);
        CHECK(dbf_put_num(&db, rec, 1, (long)i * 100L) == DBF_OK);
        if (dbf_append(&db, rec) != DBF_OK) break;
    }
    dbf_close(&db);
    CHECK(read_bytes("T3.DBF", h, 8) == 8);
    CHECK(h[4] == 44 && h[5] == 1 && h[6] == 0 && h[7] == 0); /* 300 = 0x012C */
    CHECK(file_size("T3.DBF") == 129L + 300L * 23L + 1L);
    CHECK(dbf_open(&db, "T3.DBF") == DBF_OK);
    CHECK(dbf_read(&db, 299L, rec) == DBF_OK);
    CHECK(dbf_get_num(&db, rec, 1) == 29900L);
    dbf_close(&db);
}

static void test_errors(void)
{
    DBF db;
    DBF_FIELD bad[1] = {{"TOOLONGNAME", 'C', 10, 0}};
    DBF_FIELD wide[1] = {{"WIDE", 'N', 30, 2}};
    CHECK(dbf_open(&db, "MISSING.DBF") == DBF_ERR_IO);
    CHECK(dbf_create("T4.DBF", bad, 1, 98, 1, 1) == DBF_ERR_FIELD); /* 11 chars, max is 10 */
    CHECK(dbf_create("T4.DBF", wide, 1, 98, 1, 1) == DBF_ERR_FIELD); /* numeric wider than 19 */
    CHECK(dbf_create("T4.DBF", fields, 0, 98, 1, 1) == DBF_ERR_FIELD);
}

int main(void)
{
    test_create_empty();
    test_append_and_read();
    test_numbers();
    test_update_and_delete();
    test_many_records();
    test_errors();
    remove("T1.DBF");
    remove("T2.DBF");
    remove("T3.DBF");
    remove("T4.DBF");
    if (failures) {
        printf("%d OF %d CHECKS FAILED\n", failures, checks);
        return 1;
    }
    printf("ALL %d CHECKS PASSED\n", checks);
    return 0;
}
