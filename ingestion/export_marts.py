#!/usr/bin/env python3
"""Export Snowflake marts as the static CSV files consumed by the dashboard."""

import csv
import os
import shutil
import sys
import tempfile
from pathlib import Path

import snowflake.connector
from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = PROJECT_ROOT / "visualization" / "public" / "data"
SCHEMA = "L3_PERFORMANCE"

MARTS = {
    "airline": {
        "table": "MART_MONTHLY_AIRLINE_PERFORMANCE",
        "file": "L3_Comsumption_Monthly_AirLines_Performance.csv",
        "headers": (
            "YEAR", "MONTH", "REPORTING_AIRLINE", "STAGING_ROW_COUNT",
            "CANCELLED_ROWS", "ELIGIBLE_ARRIVAL_ROWS", "DELAYED_ARRIVAL_ROWS",
            "ON_TIME_ARRIVAL_ROWS", "CANCELLATION_RATE", "ARRIVAL_DELAY_RATE",
            "ON_TIME_RATE",
        ),
    },
    "destination": {
        "table": "MART_MONTHLY_DESTINATION_AIRPORT_PERFORMANCE",
        "file": "L3_Comsumption_Monthly_Destination_Airport_Performance.csv",
        "headers": (
            "YEAR", "MONTH", "DESTINATION_AIRPORT_CODE", "SCHEDULED_FLIGHTS",
            "CANCELLED_FLIGHTS", "DELAYED_ARRIVAL_FLIGHTS", "ELIGIBLE_ARRIVAL_FLIGHTS",
            "CANCELLATION_RATE", "ARRIVAL_DELAY_RATE",
        ),
    },
    "causes": {
        "table": "MART_MONTHLY_DELAY_CAUSES",
        "file": "L3_Comsumption_Monthly_Delay_Causes_Performance.csv",
        "headers": (
            "YEAR", "MONTH", "REPORTING_AIRLINE", "ORIGIN_AIRPORT_CODE",
            "DESTINATION_AIRPORT_CODE", "DELAYED_ARRIVAL_STAGING_ROWS",
            "TOTAL_ARRIVAL_DELAY_MINUTES", "CARRIER_DELAY_MINUTES", "WEATHER_DELAY_MINUTES",
            "NAS_DELAY_MINUTES", "SECURITY_DELAY_MINUTES", "LATE_AIRCRAFT_DELAY_MINUTES",
            "TOTAL_CLASSIFIED_DELAY_MINUTES", "CARRIER_DELAY_RECORDED_ROWS",
            "WEATHER_DELAY_RECORDED_ROWS", "NAS_DELAY_RECORDED_ROWS",
            "SECURITY_DELAY_RECORDED_ROWS", "LATE_AIRCRAFT_DELAY_RECORDED_ROWS",
            "CARRIER_DELAY_SHARE", "WEATHER_DELAY_SHARE", "NAS_DELAY_SHARE",
            "SECURITY_DELAY_SHARE", "LATE_AIRCRAFT_DELAY_SHARE",
        ),
    },
    "departure": {
        "table": "MART_MONTHLY_DEPARTURE_TIME_PERFORMANCE",
        "file": "L3_Comsumption_Monthly_Departure_Time_Performance.csv",
        "headers": (
            "YEAR", "MONTH", "SCHEDULED_DEPARTURE_TIME_BLOCK", "REPORTING_AIRLINE",
            "ORIGIN_AIRPORT_CODE", "DESTINATION_AIRPORT_CODE", "STAGING_ROW_COUNT",
            "CANCELLED_ROWS", "DIVERTED_ROWS", "ELIGIBLE_ARRIVAL_ROWS",
            "DELAYED_ARRIVAL_ROWS", "ON_TIME_ARRIVAL_ROWS",
            "TOTAL_ARRIVAL_DELAY_MINUTES", "CANCELLATION_RATE", "DIVERSION_RATE",
            "ARRIVAL_DELAY_RATE", "ON_TIME_RATE",
        ),
    },
    "priority": {
        "table": "MART_INVESTIGATION_PRIORITY",
        "file": "L3_Comsumption_Investigation_Priority_Performance.csv",
        "headers": (
            "YEAR", "MONTH", "ENTITY_TYPE", "ENTITY_KEY", "REPORTING_AIRLINE",
            "ORIGIN_AIRPORT_CODE", "DESTINATION_AIRPORT_CODE", "KPI_NAME", "KPI_UNIT",
            "STAGING_ROW_COUNT", "KPI_VALUE", "PREVIOUS_MONTH_VALUE",
            "MONTH_OVER_MONTH_CHANGE", "SAME_MONTH_LAST_YEAR_VALUE",
            "YEAR_OVER_YEAR_CHANGE", "CURRENT_VALUE_RANK",
            "MONTH_OVER_MONTH_CHANGE_RANK", "YEAR_OVER_YEAR_CHANGE_RANK",
        ),
    },
}


def quote_identifier(value):
    return '"' + value.replace('"', '""') + '"'


def query_mart(cursor, mart):
    table = mart["table"]
    if table not in {item["table"] for item in MARTS.values()}:
        raise ValueError(f"Unapproved mart table: {table}")
    columns = ", ".join(quote_identifier(column) for column in mart["headers"])
    cursor.execute(f"SELECT {columns} FROM {quote_identifier(table)}")
    headers = tuple(str(column[0]).upper() for column in cursor.description or ())
    if headers != mart["headers"]:
        raise ValueError(
            f"Unexpected columns for {table}: expected {mart['headers']}, got {headers}"
        )
    rows = cursor.fetchall()
    if not rows:
        raise ValueError(f"Mart {table} returned zero rows; export was not published")
    return headers, rows


def rollback_publish(output_dir, backup_dir, published, mart_files, replace):
    errors = []
    for filename in reversed(mart_files):
        destination = output_dir / filename
        backup = backup_dir / filename
        try:
            if backup.exists():
                destination.unlink(missing_ok=True)
                replace(backup, destination)
            elif filename in published:
                destination.unlink(missing_ok=True)
        except Exception as error:
            errors.append(f"{filename}: {type(error).__name__}")
    if errors:
        raise OSError("Could not fully restore export files: " + ", ".join(errors))


def publish_staged_files(staging_dir, output_dir, replace=os.replace):
    mart_files = [mart["file"] for mart in MARTS.values()]
    backup_dir = staging_dir / "backup"
    backup_dir.mkdir()
    published = set()
    try:
        for filename in mart_files:
            staged = staging_dir / filename
            destination = output_dir / filename
            backup = backup_dir / filename
            if destination.exists():
                replace(destination, backup)
            replace(staged, destination)
            published.add(filename)
    except Exception as publish_error:
        try:
            rollback_publish(output_dir, backup_dir, published, mart_files, replace)
        except Exception as rollback_error:
            publish_error.add_note(
                f"Export rollback also failed ({type(rollback_error).__name__}); "
                f"preserve backup directory: {backup_dir}"
            )
            raise publish_error
        raise


def export_marts(connection, output_dir=OUTPUT_DIR, replace=os.replace):
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    staging_dir = Path(tempfile.mkdtemp(prefix=".mart-export-", dir=output_dir))
    preserve_staging = False
    cursor = None
    try:
        cursor = connection.cursor()
        for mart in MARTS.values():
            headers, rows = query_mart(cursor, mart)
            with (staging_dir / mart["file"]).open(
                "w", newline="", encoding="utf-8"
            ) as output:
                writer = csv.writer(output, lineterminator="\n")
                writer.writerow(headers)
                writer.writerows(rows)
        try:
            publish_staged_files(staging_dir, output_dir, replace=replace)
        except Exception:
            preserve_staging = (staging_dir / "backup").exists() and any(
                (staging_dir / "backup" / mart["file"]).exists()
                for mart in MARTS.values()
            )
            raise
    finally:
        if cursor is not None:
            try:
                cursor.close()
            except Exception:
                pass
        if not preserve_staging:
            shutil.rmtree(staging_dir, ignore_errors=True)


def connection_config():
    load_dotenv(dotenv_path=PROJECT_ROOT / ".env", override=False)
    required = (
        "SNOWFLAKE_ACCOUNT", "SNOWFLAKE_USER", "SNOWFLAKE_WAREHOUSE",
        "SNOWFLAKE_DATABASE",
    )
    missing = [key for key in required if not os.environ.get(key)]
    if missing:
        raise ValueError("Missing required environment variables: " + ", ".join(missing))

    password = os.environ.get("SNOWFLAKE_PASSWORD")
    authenticator = os.environ.get("SNOWFLAKE_AUTHENTICATOR")
    if bool(password) == bool(authenticator):
        raise ValueError("Set exactly one of SNOWFLAKE_PASSWORD or SNOWFLAKE_AUTHENTICATOR")
    config = {
        "account": os.environ["SNOWFLAKE_ACCOUNT"],
        "user": os.environ["SNOWFLAKE_USER"],
        "warehouse": os.environ["SNOWFLAKE_WAREHOUSE"],
        "database": os.environ["SNOWFLAKE_DATABASE"],
        "schema": SCHEMA,
    }
    if password:
        config["password"] = password
    else:
        config["authenticator"] = authenticator
    if os.environ.get("SNOWFLAKE_ROLE"):
        config["role"] = os.environ["SNOWFLAKE_ROLE"]
    return config


def main():
    connection = snowflake.connector.connect(**connection_config())
    try:
        export_marts(connection)
    finally:
        connection.close()
    print(f"Exported {len(MARTS)} dashboard mart CSV files to {OUTPUT_DIR}")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        message = str(error)
        secret = os.environ.get("SNOWFLAKE_PASSWORD")
        if secret:
            message = message.replace(secret, "<redacted>")
        print(f"Mart export failed ({type(error).__name__}): {message}", file=sys.stderr)
        sys.exit(1)
