#!/usr/bin/env python3
"""Load a BTS monthly CSV into a raw Snowflake table."""

import csv
import argparse
import hashlib
import os
import sys
import time
from pathlib import Path

import snowflake.connector
from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(dotenv_path=PROJECT_ROOT / ".env", override=True)

CSV_PATH = PROJECT_ROOT / "data" / "Raw" / "07_2025.csv"


def quote_identifier(value):
    return '"' + value.replace('"', '""') + '"'


def quote_string(value):
    return "'" + value.replace("'", "''") + "'"


def build_merge_statement(target, temp_table, header):
    matches = " AND ".join(
        f"EQUAL_NULL(t.{quote_identifier(name)}, s.{quote_identifier(name)})"
        for name in header
    )
    insert_columns = ", ".join(quote_identifier(name) for name in header)
    source_columns = ", ".join(f"s.{quote_identifier(name)}" for name in header)
    return (
        f"MERGE INTO {target} t "
        f"USING (SELECT DISTINCT {insert_columns} FROM {temp_table}) s "
        f"ON {matches} "
        f"WHEN NOT MATCHED THEN INSERT ({insert_columns}) VALUES ({source_columns})"
    )


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_header(csv_path):
    with csv_path.open("r", newline="", encoding="utf-8-sig") as source:
        header = next(csv.reader(source), None)
    if not header:
        raise ValueError(f"CSV is empty or has no header: {csv_path}")
    # Some BTS exports include one extra delimiter after the named fields.
    if header[-1] == "":
        header = header[:-1]
    if not header or any(not name for name in header) or len(set(header)) != len(header):
        raise ValueError("CSV header contains an unnamed or duplicate source column")
    return header


def validate_csv_rows(csv_path, expected_columns):
    print(f"Validating {csv_path.name}...", flush=True)
    validated_rows = 0
    with csv_path.open("r", newline="", encoding="utf-8-sig") as source:
        rows = csv.reader(source)
        next(rows)
        for line_number, row in enumerate(rows, start=2):
            has_trailing_empty_field = (
                len(row) == expected_columns + 1 and row[-1] == ""
            )
            if len(row) != expected_columns and not has_trailing_empty_field:
                raise ValueError(
                    f"CSV row {line_number} in {csv_path.name} has {len(row)} fields; "
                    f"expected {expected_columns}, optionally followed by one empty field"
                )
            validated_rows += 1
            if validated_rows % 100_000 == 0:
                print(f"Validated {validated_rows:,} rows in {csv_path.name}", flush=True)
    print(f"Validated {validated_rows:,} rows in {csv_path.name}", flush=True)
    return validated_rows


def merge_and_update_audit(
    connection,
    cursor,
    audit_sql,
    audit_params,
    merge_sql,
):
    """Apply data and its fingerprint atomically after staging has been validated."""
    transaction_open = False
    try:
        cursor.execute("BEGIN")
        transaction_open = True
        cursor.execute(merge_sql)
        merge_rows = cursor.fetchall()
        merge_description = cursor.description
        cursor.execute(audit_sql, audit_params)
        try:
            connection.commit()
        except Exception as error:
            error.add_note(
                "connection.commit() failed; rollback will be attempted, but the final "
                "Snowflake commit outcome may be uncertain if the connection was lost."
            )
            raise
        transaction_open = False
        return merge_rows, merge_description
    except Exception as error:
        if transaction_open:
            try:
                connection.rollback()
            except Exception as rollback_error:
                # Keep the operation/commit error as the exception Airflow sees.
                error.add_note(
                    f"Rollback also failed ({type(rollback_error).__name__})."
                )
        raise


def required_config():
    required = [
        "SNOWFLAKE_ACCOUNT",
        "SNOWFLAKE_USER",
        "SNOWFLAKE_WAREHOUSE",
        "SNOWFLAKE_DATABASE",
        "SNOWFLAKE_SCHEMA",
        "SNOWFLAKE_RAW_TABLE",
    ]
    missing = [name for name in required if not os.environ.get(name)]
    if missing:
        raise ValueError("Missing required environment variables: " + ", ".join(missing))

    password = os.environ.get("SNOWFLAKE_PASSWORD")
    authenticator = os.environ.get("SNOWFLAKE_AUTHENTICATOR")
    if not password and not authenticator:
        raise ValueError(
            "Set SNOWFLAKE_PASSWORD or SNOWFLAKE_AUTHENTICATOR "
            "(for example, externalbrowser for SSO)."
        )
    if password and authenticator:
        raise ValueError("Set only one of SNOWFLAKE_PASSWORD and SNOWFLAKE_AUTHENTICATOR")
    return password, authenticator


def load_csv(csv_path, database, schema, table, connect_args, force=False):
    header = read_header(csv_path)
    validated_rows = validate_csv_rows(csv_path, len(header))
    if validated_rows == 0:
        raise ValueError(f"CSV has a header but no data rows: {csv_path.name}")
    column_signature = hashlib.sha256("\x1f".join(header).encode("utf-8")).hexdigest()
    file_signature = sha256_file(csv_path)
    target = ".".join(map(quote_identifier, (database, schema, table)))
    audit_name = f"{table}_INGEST_AUDIT"
    audit_target = ".".join(map(quote_identifier, (database, schema, audit_name)))
    columns = ", ".join(quote_identifier(name) for name in header)
    definitions = ",\n    ".join(f"{quote_identifier(name)} VARCHAR" for name in header)
    temp_table = quote_identifier(f"__INGEST_{table}")
    stage_path = "@~/airline_ops_ingest/"

    connect_args = {
        **connect_args,
        "database": database,
        "schema": schema,
        "autocommit": False,
    }
    connection = snowflake.connector.connect(**connect_args)
    cursor = None
    try:
        cursor = connection.cursor()
        print(f"Checking Snowflake target: {target}", flush=True)
        cursor.execute(f"CREATE TABLE IF NOT EXISTS {target} (\n    {definitions}\n)")
        cursor.execute(
            f"CREATE TABLE IF NOT EXISTS {audit_target} ("
            '"FILE_NAME" VARCHAR, "FILE_SHA256" VARCHAR, '
            '"COLUMN_SIGNATURE" VARCHAR, "ROW_COUNT" NUMBER, '
            '"UPDATED_AT" TIMESTAMP_TZ)'
        )
        cursor.execute(f"DESCRIBE TABLE {target}")
        description = cursor.fetchall()
        existing_columns = {row[0] for row in description}
        new_columns = [name for name in header if name not in existing_columns]
        cursor.execute(
            f"SELECT \"FILE_SHA256\", \"COLUMN_SIGNATURE\" FROM {audit_target} "
            "WHERE \"FILE_NAME\" = %s",
            (csv_path.name,),
        )
        prior_file = cursor.fetchone()
        if (
            not force
            and prior_file
            and prior_file[0] == file_signature
            and prior_file[1] == column_signature
            and not new_columns
        ):
            print(
                f"Skipping {csv_path.name}: file content and columns are unchanged "
                "since the last successful load. Use --force to reload it.",
                flush=True,
            )
            return
        if force:
            print(f"Force reload enabled for {csv_path.name}.", flush=True)

        if new_columns:
            print(f"Adding {len(new_columns)} new CSV columns to {target}.", flush=True)
            for name in new_columns:
                cursor.execute(
                    f"ALTER TABLE {target} ADD COLUMN IF NOT EXISTS "
                    f"{quote_identifier(name)} VARCHAR"
                )
            cursor.execute(f"DESCRIBE TABLE {target}")
            description = cursor.fetchall()

        # Preserve empty strings in the VARCHAR landing table. Typed targets need
        # empty CSV fields converted to NULL before Snowflake casts them to numbers.
        empty_field_as_null = any(
            str(row[1]).upper().startswith("NUMBER") for row in description
        )
        null_if = (
            "('', '__BTS_RAW_NULL_SENTINEL__')"
            if empty_field_as_null
            else "('__BTS_RAW_NULL_SENTINEL__')"
        )

        phase_started = time.perf_counter()
        print(
            f"Uploading changed file {csv_path.name} "
            f"({csv_path.stat().st_size / 1_000_000:.0f} MB) to the temporary stage...",
            flush=True,
        )
        cursor.execute(
            f"PUT {quote_string(csv_path.as_uri())} {stage_path} "
            "AUTO_COMPRESS=TRUE PARALLEL=4 OVERWRITE=TRUE"
        )
        print(f"Upload took {time.perf_counter() - phase_started:.1f}s", flush=True)
        print(f"Copying {csv_path.name} into a session temporary table...", flush=True)
        cursor.execute(f"CREATE TEMPORARY TABLE {temp_table} LIKE {target}")
        phase_started = time.perf_counter()
        cursor.execute(
            f"COPY INTO {temp_table} ({columns}) FROM {stage_path} "
            f"FILES=({quote_string(csv_path.name + '.gz')}) "
            "FILE_FORMAT=(TYPE=CSV SKIP_HEADER=1 "
            "FIELD_OPTIONALLY_ENCLOSED_BY='\"' "
            f"EMPTY_FIELD_AS_NULL={'TRUE' if empty_field_as_null else 'FALSE'} "
            "ERROR_ON_COLUMN_COUNT_MISMATCH=FALSE "
            f"NULL_IF={null_if}) "
            "ON_ERROR=ABORT_STATEMENT PURGE=TRUE"
        )
        copy_results = cursor.fetchall()
        copied_rows = sum(int(row[3]) for row in copy_results)
        if copied_rows != validated_rows:
            raise ValueError(
                f"Snowflake staged {copied_rows:,} rows from {csv_path.name}; "
                f"CSV validation found {validated_rows:,}. Target table was not changed."
            )
        print(f"Temporary COPY took {time.perf_counter() - phase_started:.1f}s", flush=True)

        merge_sql = build_merge_statement(target, temp_table, header)
        audit_sql = (
            f"MERGE INTO {audit_target} a USING ("
            "SELECT %s AS \"FILE_NAME\", %s AS \"FILE_SHA256\", "
            "%s AS \"COLUMN_SIGNATURE\", %s AS \"ROW_COUNT\") s "
            "ON a.\"FILE_NAME\" = s.\"FILE_NAME\" "
            "WHEN MATCHED THEN UPDATE SET "
            "a.\"FILE_SHA256\" = s.\"FILE_SHA256\", "
            "a.\"COLUMN_SIGNATURE\" = s.\"COLUMN_SIGNATURE\", "
            "a.\"ROW_COUNT\" = s.\"ROW_COUNT\", "
            "a.\"UPDATED_AT\" = CURRENT_TIMESTAMP() "
            "WHEN NOT MATCHED THEN INSERT "
            "(\"FILE_NAME\", \"FILE_SHA256\", \"COLUMN_SIGNATURE\", \"ROW_COUNT\", \"UPDATED_AT\") "
            "VALUES (s.\"FILE_NAME\", s.\"FILE_SHA256\", s.\"COLUMN_SIGNATURE\", "
            "s.\"ROW_COUNT\", CURRENT_TIMESTAMP())"
        )
        merge_result, merge_description = merge_and_update_audit(
            connection,
            cursor,
            audit_sql,
            (csv_path.name, file_signature, column_signature, validated_rows),
            merge_sql,
        )
        inserted_rows = 0
        if merge_result and merge_description:
            result_columns = [str(column[0]).lower() for column in merge_description]
            inserted_index = next(
                (index for index, name in enumerate(result_columns) if "inserted" in name),
                None,
            )
            if inserted_index is not None:
                inserted_rows = int(merge_result[0][inserted_index])

        print(
            f"{csv_path.name}: {inserted_rows:,} new rows inserted; "
            f"{validated_rows - inserted_rows:,} rows not inserted because they were "
            "already present or duplicated within the file.",
            flush=True,
        )
    finally:
        if cursor is not None:
            try:
                cursor.close()
            except Exception:
                pass
        try:
            connection.close()
        except Exception:
            pass


def main():
    parser = argparse.ArgumentParser(description="Incrementally load BTS CSV data into Snowflake.")
    parser.add_argument("--csv-path", type=Path)
    parser.add_argument("--all-csvs", action="store_true")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Reload files even when their audit fingerprints are unchanged.",
    )
    args = parser.parse_args()
    raw_dir = (PROJECT_ROOT / "data" / "Raw").resolve()
    if args.all_csvs:
        csv_paths = sorted(raw_dir.glob("*.csv"))
    else:
        csv_paths = [args.csv_path or CSV_PATH]
    csv_paths = [path.expanduser().resolve() for path in csv_paths]
    if not csv_paths:
        raise FileNotFoundError(f"No CSV files found in {raw_dir}")

    for csv_path in csv_paths:
        try:
            csv_path.relative_to(raw_dir)
        except ValueError as error:
            raise ValueError(f"CSV must be inside {raw_dir}") from error
        if not csv_path.is_file():
            raise FileNotFoundError(f"CSV not found: {csv_path}")

    password, authenticator = required_config()
    database = os.environ["SNOWFLAKE_DATABASE"]
    schema = os.environ["SNOWFLAKE_SCHEMA"]
    table = os.environ["SNOWFLAKE_RAW_TABLE"]
    connect_args = {
        "account": os.environ["SNOWFLAKE_ACCOUNT"],
        "user": os.environ["SNOWFLAKE_USER"],
        "warehouse": os.environ["SNOWFLAKE_WAREHOUSE"],
    }
    if password:
        connect_args["password"] = password
    else:
        connect_args["authenticator"] = authenticator
    if os.environ.get("SNOWFLAKE_ROLE"):
        connect_args["role"] = os.environ["SNOWFLAKE_ROLE"]

    for csv_path in csv_paths:
        load_csv(csv_path, database, schema, table, connect_args, force=args.force)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Never print a password if the connector includes it in an exception message.
        if isinstance(error, (ValueError, FileNotFoundError)):
            print(f"ERROR: {error}", file=sys.stderr)
        else:
            message = str(error)
            for secret_name in ("SNOWFLAKE_PASSWORD",):
                secret = os.environ.get(secret_name)
                if secret:
                    message = message.replace(secret, "<redacted>")
            notes = getattr(error, "__notes__", ())
            for note in notes:
                if secret:
                    note = note.replace(secret, "<redacted>")
                message += f"; {note}"
            print(f"Snowflake load failed ({type(error).__name__}): {message}", file=sys.stderr)
        sys.exit(1)
