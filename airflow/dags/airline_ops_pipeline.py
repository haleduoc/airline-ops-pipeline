from datetime import datetime, timedelta, timezone
from pathlib import Path

from airflow.sdk import DAG, get_current_context, task
from airflow.providers.standard.operators.bash import BashOperator
from loader_runner import run_loader


with DAG(
    dag_id="airline_ops_pipeline",
    description="Load BTS flight data, transform it with dbt, and run dbt tests.",
    start_date=datetime(2026, 1, 1, tzinfo=timezone.utc),
    schedule=None,
    catchup=False,
    max_active_runs=1,
    max_active_tasks=2,
    default_args={"retries": 0},
    tags=["airline-ops", "snowflake", "dbt"],
) as dag:
    @task
    def discover_csvs():
        csv_paths = sorted(Path("/workspace/data/Raw").glob("*.csv"))
        if not csv_paths:
            raise FileNotFoundError("No CSV files found in /workspace/data/Raw")
        dag_conf = get_current_context()["dag_run"].conf or {}
        force_reload = str(dag_conf.get("full_reload", "")).strip().lower() in {
            "true",
            "1",
            "yes",
        }
        return [
            {"csv_path": str(path), "force_reload": force_reload}
            for path in csv_paths
        ]

    csv_partitions = discover_csvs()

    @task(
        task_id="ingest_bts",
        pool="airline_ops_snowflake_write",
        execution_timeout=timedelta(minutes=30),
    )
    def ingest_csv(csv_path, force_reload):
        run_loader(csv_path, force_reload)

    ingest_bts = ingest_csv.expand_kwargs(csv_partitions)

    dbt_run_l2 = BashOperator(
        task_id="dbt_run_l2",
        bash_command=(
            "/home/airflow/dbt-venv/bin/dbt run --select path:models/staging "
            "--project-dir /workspace/Transformation "
            "--profiles-dir /workspace/Transformation"
        ),
    )

    dbt_run_l3 = BashOperator(
        task_id="dbt_run_l3",
        bash_command=(
            "/home/airflow/dbt-venv/bin/dbt run --select path:models/marts "
            "--project-dir /workspace/Transformation "
            "--profiles-dir /workspace/Transformation"
        ),
    )

    dbt_test = BashOperator(
        task_id="dbt_test",
        bash_command=(
            "/home/airflow/dbt-venv/bin/dbt test "
            "--project-dir /workspace/Transformation "
            "--profiles-dir /workspace/Transformation"
        ),
    )

    csv_partitions >> ingest_bts
    ingest_bts >> dbt_run_l2 >> dbt_run_l3 >> dbt_test
