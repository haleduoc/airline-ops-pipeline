#!/usr/bin/env python3
"""Trigger the pipeline when a CSV is added or changed in the raw-data folder."""

import argparse
import json
import os
import subprocess
import time
from pathlib import Path


CSV_DIR = Path(os.getenv("AIRLINE_OPS_CSV_DIR", "/workspace/data/Raw"))
STATE_FILE = Path(
    os.getenv("AIRLINE_OPS_TRIGGER_STATE", "/var/lib/airflow-auto-trigger/state.json")
)
POLL_SECONDS = max(1, int(os.getenv("AIRLINE_OPS_POLL_SECONDS", "10")))
STABLE_SECONDS = max(1, int(os.getenv("AIRLINE_OPS_STABLE_SECONDS", "30")))


def csv_snapshot():
    return {
        path.name: {"size": path.stat().st_size, "mtime_ns": path.stat().st_mtime_ns}
        for path in sorted(CSV_DIR.glob("*.csv"))
        if path.is_file()
    }


def load_state():
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8")).get("snapshot", {})
    except FileNotFoundError:
        return {}


def save_state(snapshot):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    temporary = STATE_FILE.with_suffix(".tmp")
    temporary.write_text(json.dumps({"snapshot": snapshot}), encoding="utf-8")
    temporary.replace(STATE_FILE)


def has_added_or_changed_csv(current, previous):
    return any(previous.get(name) != metadata for name, metadata in current.items())


def trigger_pipeline():
    command = [
        "airflow",
        "dags",
        "trigger",
        "--conf",
        json.dumps({"full_reload": False, "trigger_source": "csv_watcher"}),
        "airline_ops_pipeline",
    ]
    try:
        result = subprocess.run(command, check=False, timeout=60)
    except subprocess.TimeoutExpired:
        print("Airflow trigger timed out; will retry after the next stable check.", flush=True)
        return False
    return result.returncode == 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--baseline",
        action="store_true",
        help="Record current CSVs without triggering the DAG.",
    )
    args = parser.parse_args()

    if args.baseline:
        current = csv_snapshot()
        save_state(current)
        print(f"Baseline recorded for {len(current)} CSV file(s).", flush=True)
        return

    previous = load_state()
    observed = None
    stable_since = None
    print(f"Watching {CSV_DIR} for stable CSV changes.", flush=True)

    while True:
        current = csv_snapshot()
        changed = has_added_or_changed_csv(current, previous)
        if not changed:
            observed = None
            stable_since = None
        elif current != observed:
            observed = current
            stable_since = time.monotonic()
        elif stable_since is not None and time.monotonic() - stable_since >= STABLE_SECONDS:
            print("Stable CSV change detected; triggering airline_ops_pipeline.", flush=True)
            if trigger_pipeline():
                previous = current
                save_state(previous)
                print("DAG trigger accepted; snapshot saved.", flush=True)
            else:
                print("DAG trigger failed; will retry.", flush=True)
            observed = None
            stable_since = None
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
