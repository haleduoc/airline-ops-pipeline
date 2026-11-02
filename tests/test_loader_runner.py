import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

from airflow.dags.loader_runner import run_loader


class LoaderRunnerTests(unittest.TestCase):
    def test_shell_metacharacters_stay_in_a_single_argument(self):
        with tempfile.TemporaryDirectory() as temp:
            raw_dir = Path(temp) / "Raw"
            raw_dir.mkdir()
            filename = "july; touch PWNED && echo x.csv"
            csv_path = raw_dir / filename
            csv_path.write_text("x\n1\n", encoding="utf-8")
            runner = Mock()

            run_loader(
                csv_path,
                True,
                raw_dir=raw_dir,
                loader_path="/workspace/ingestion/load_data.py",
                python_executable="python-test",
                runner=runner,
            )

            runner.assert_called_once_with(
                [
                    "python-test", "-u", "/workspace/ingestion/load_data.py",
                    "--csv-path", str(csv_path.resolve()), "--force",
                ],
                shell=False,
                check=True,
            )
            self.assertFalse((Path(temp) / "PWNED").exists())

    def test_rejects_paths_outside_raw_directory(self):
        with tempfile.TemporaryDirectory() as temp:
            raw_dir = Path(temp) / "Raw"
            raw_dir.mkdir()
            other = Path(temp) / "elsewhere.csv"
            other.write_text("x\n1\n", encoding="utf-8")
            runner = Mock()

            with self.assertRaisesRegex(ValueError, "inside"):
                run_loader(other, raw_dir=raw_dir, runner=runner)
            runner.assert_not_called()

    def test_airflow_task_uses_serial_write_pool(self):
        dag_source = Path("airflow/dags/airline_ops_pipeline.py").read_text()
        self.assertIn('pool="airline_ops_snowflake_write"', dag_source)
        compose_source = Path("compose.yaml").read_text()
        self.assertIn("airflow pools set airline_ops_snowflake_write 1", compose_source)


if __name__ == "__main__":
    unittest.main()
