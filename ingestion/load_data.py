#!/usr/bin/env python3
"""Load the July 2025 BTS CSV into a raw Snowflake table."""

import csv
import os
import sys
from pathlib import Path

import snowflake.connector
from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(dotenv_path=PROJECT_ROOT / ".env", override=True)

CSV_PATH = PROJECT_ROOT / "data" / "Raw" / "07_2025.csv"
STAGE_PATH = "@~/bts_07_2025/"


def quote_identifier(value):
    return '"' + value.replace('"', '""') + '"'


def read_header():
    with CSV_PATH.open("r", newline="", encoding="utf-8-sig") as source:
        header = next(csv.reader(source), None)
    if not header:
        raise ValueError(f"CSV is empty or has no header: {CSV_PATH}")
    # BTS's July 2025 export has an extra trailing delimiter after its 109 named fields.
    if header[-1] == "":
        header = header[:-1]
    if not header or any(not name for name in header) or len(set(header)) != len(header):
        raise ValueError("CSV header contains an unnamed or duplicate source column")
    return header


def validate_csv_rows(expected_columns):
    with CSV_PATH.open("r", newline="", encoding="utf-8-sig") as source:
        rows = csv.reader(source)
        next(rows)
        for line_number, row in enumerate(rows, start=2):
            if len(row) != expected_columns + 1 or row[-1] != "":
                raise ValueError(
                    f"CSV row {line_number} does not have exactly {expected_columns} "
                    "named fields followed by the observed empty trailing field"
                )


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


def main():
    if not CSV_PATH.is_file():
        raise FileNotFoundError(f"Expected July 2025 CSV not found: {CSV_PATH}")

    password, authenticator = required_config()
    header = read_header()
    validate_csv_rows(len(header))
    database = os.environ["SNOWFLAKE_DATABASE"]
    schema = os.environ["SNOWFLAKE_SCHEMA"]
    table = os.environ["SNOWFLAKE_RAW_TABLE"]
    target = ".".join(map(quote_identifier, (database, schema, table)))
    columns = ", ".join(quote_identifier(name) for name in header)
    definitions = ",\n    ".join(f"{quote_identifier(name)} VARCHAR" for name in header)

    connect_args = {
        "account": os.environ["SNOWFLAKE_ACCOUNT"],
        "user": os.environ["SNOWFLAKE_USER"],
        "warehouse": os.environ["SNOWFLAKE_WAREHOUSE"],
        "database": database,
        "schema": schema,
    }
    if password:
        connect_args["password"] = password
    else:
        connect_args["authenticator"] = authenticator
    if os.environ.get("SNOWFLAKE_ROLE"):
        connect_args["role"] = os.environ["SNOWFLAKE_ROLE"]

    connection = snowflake.connector.connect(**connect_args)
    try:
        cursor = connection.cursor()
        cursor.execute(f"CREATE TABLE IF NOT EXISTS {target} (\n    {definitions}\n)")
        cursor.execute(f"DESCRIBE TABLE {target}")
        existing = [row[0] for row in cursor.fetchall()]
        if existing != header:
            raise ValueError(
                f"Target table columns do not match the July 2025 CSV header: {target}. "
                "No data was staged or copied."
            )

        cursor.execute(
            f"PUT 'file://{CSV_PATH}' {STAGE_PATH} "
            "AUTO_COMPRESS=FALSE OVERWRITE=TRUE"
        )
        cursor.execute(
            f"COPY INTO {target} ({columns}) FROM {STAGE_PATH} "
            "FILES=('07_2025.csv') "
            "FILE_FORMAT=(TYPE=CSV SKIP_HEADER=1 "
            "FIELD_OPTIONALLY_ENCLOSED_BY='\"' EMPTY_FIELD_AS_NULL=FALSE "
            "ERROR_ON_COLUMN_COUNT_MISMATCH=FALSE "
            "NULL_IF=('__BTS_RAW_NULL_SENTINEL__')) "
            "ON_ERROR=ABORT_STATEMENT PURGE=TRUE"
        )
        results = cursor.fetchall()
        loaded = sum(int(row[3]) for row in results)
        print(f"Target: {target}")
        print(f"CSV: {CSV_PATH}")
        print(f"Snowflake COPY rows loaded: {loaded}")
        cursor.close()
    finally:
        connection.close()


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
            print(f"Snowflake load failed ({type(error).__name__}): {message}", file=sys.stderr)
        sys.exit(1)
