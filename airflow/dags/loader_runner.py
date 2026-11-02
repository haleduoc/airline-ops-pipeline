"""Run the ingestion loader without interpreting CSV paths as shell syntax."""

import subprocess
import sys
from pathlib import Path


def run_loader(
    csv_path,
    force_reload=False,
    *,
    raw_dir="/workspace/data/Raw",
    loader_path="/workspace/ingestion/load_data.py",
    python_executable=None,
    runner=None,
):
    raw_root = Path(raw_dir).resolve()
    source_path = Path(csv_path).expanduser().resolve()
    try:
        source_path.relative_to(raw_root)
    except ValueError as error:
        raise ValueError(f"CSV must be inside {raw_root}") from error
    if not source_path.is_file():
        raise FileNotFoundError(f"CSV not found: {source_path}")

    command = [
        python_executable or sys.executable,
        "-u",
        str(loader_path),
        "--csv-path",
        str(source_path),
    ]
    if force_reload:
        command.append("--force")
    (runner or subprocess.run)(command, shell=False, check=True)

