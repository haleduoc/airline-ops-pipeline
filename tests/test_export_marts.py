import csv
import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

from ingestion.export_marts import MARTS, export_marts


class FakeCursor:
    def __init__(self, results, wrong_header_table=None, fail_on_execute=False):
        self.results = results
        self.wrong_header_table = wrong_header_table
        self.fail_on_execute = fail_on_execute
        self.description = None
        self.current = None
        self.closed = False

    def execute(self, sql):
        if self.fail_on_execute:
            raise RuntimeError("simulated query failure")
        table = next(
            mart["table"] for mart in MARTS.values()
            if f'FROM "{mart["table"]}"' in sql
        )
        self.current = next(mart for mart in MARTS.values() if mart["table"] == table)
        headers = list(self.current["headers"])
        if table == self.wrong_header_table:
            headers[0] = "NOT_YEAR"
        self.description = [(name,) for name in headers]

    def fetchall(self):
        return self.results[self.current["table"]]

    def close(self):
        self.closed = True


class ExportTests(unittest.TestCase):
    def test_export_contract_matches_dashboard_mapping(self):
        dashboard_config = Path("visualization/src/martData.js").read_text()
        for mart in MARTS.values():
            file_marker = f"file: '{mart['file']}'"
            start = dashboard_config.index(file_marker)
            end = dashboard_config.find("\n  },", start)
            block = dashboard_config[start:end]
            required_match = re.search(r"required:\s*\[(.*?)\]", block, re.S)
            self.assertIsNotNone(required_match, mart["file"])
            dashboard_headers = {"YEAR", "MONTH"}
            dashboard_headers.update(re.findall(r"'([^']+)'", required_match.group(1)))
            self.assertEqual(set(mart["headers"]), dashboard_headers, mart["file"])

    def make_results(self, empty_table=None):
        results = {}
        for mart in MARTS.values():
            if mart["table"] == empty_table:
                results[mart["table"]] = []
            else:
                results[mart["table"]] = [tuple("1" for _ in mart["headers"])]
        return results

    def seed_old_files(self, output_dir):
        old = {}
        for mart in MARTS.values():
            path = output_dir / mart["file"]
            content = f"old:{mart['file']}\n"
            path.write_text(content, encoding="utf-8")
            old[mart["file"]] = content
        return old

    def test_exports_exact_dashboard_files_and_headers(self):
        with tempfile.TemporaryDirectory() as temp:
            output_dir = Path(temp)
            cursor = FakeCursor(self.make_results())
            connection = Mock()
            connection.cursor.return_value = cursor

            export_marts(connection, output_dir)

            for mart in MARTS.values():
                path = output_dir / mart["file"]
                with path.open(newline="", encoding="utf-8") as stream:
                    rows = list(csv.reader(stream))
                self.assertEqual(tuple(rows[0]), mart["headers"])
                self.assertEqual(len(rows), 2)
            self.assertTrue(cursor.closed)

    def test_zero_row_mart_keeps_all_published_files_unchanged(self):
        with tempfile.TemporaryDirectory() as temp:
            output_dir = Path(temp)
            original = self.seed_old_files(output_dir)
            cursor = FakeCursor(self.make_results("MART_MONTHLY_DELAY_CAUSES"))
            connection = Mock()
            connection.cursor.return_value = cursor

            with self.assertRaisesRegex(ValueError, "zero rows"):
                export_marts(connection, output_dir)

            for filename, content in original.items():
                self.assertEqual((output_dir / filename).read_text(), content)
            self.assertTrue(cursor.closed)

    def test_header_mismatch_keeps_all_published_files_unchanged(self):
        with tempfile.TemporaryDirectory() as temp:
            output_dir = Path(temp)
            original = self.seed_old_files(output_dir)
            cursor = FakeCursor(
                self.make_results(), wrong_header_table="MART_MONTHLY_AIRLINE_PERFORMANCE"
            )
            connection = Mock()
            connection.cursor.return_value = cursor

            with self.assertRaisesRegex(ValueError, "Unexpected columns"):
                export_marts(connection, output_dir)

            for filename, content in original.items():
                self.assertEqual((output_dir / filename).read_text(), content)
            self.assertTrue(cursor.closed)

    def test_query_failure_keeps_all_published_files_unchanged(self):
        with tempfile.TemporaryDirectory() as temp:
            output_dir = Path(temp)
            original = self.seed_old_files(output_dir)
            cursor = FakeCursor(self.make_results(), fail_on_execute=True)
            connection = Mock()
            connection.cursor.return_value = cursor

            with self.assertRaisesRegex(RuntimeError, "simulated query failure"):
                export_marts(connection, output_dir)

            for filename, content in original.items():
                self.assertEqual((output_dir / filename).read_text(), content)
            self.assertTrue(cursor.closed)

    def test_publish_failure_restores_existing_set(self):
        with tempfile.TemporaryDirectory() as temp:
            output_dir = Path(temp)
            original = self.seed_old_files(output_dir)
            cursor = FakeCursor(self.make_results())
            connection = Mock()
            connection.cursor.return_value = cursor
            real_replace = __import__("os").replace
            calls = 0

            def fail_once(source, destination):
                nonlocal calls
                calls += 1
                if calls == 4:
                    raise OSError("simulated publish failure")
                real_replace(source, destination)

            with self.assertRaisesRegex(OSError, "simulated publish failure"):
                export_marts(connection, output_dir, replace=fail_once)

            for filename, content in original.items():
                self.assertEqual((output_dir / filename).read_text(), content)
            self.assertFalse(list(output_dir.glob(".mart-export-*")))

    def test_first_publish_failure_removes_partial_new_files(self):
        with tempfile.TemporaryDirectory() as temp:
            output_dir = Path(temp)
            cursor = FakeCursor(self.make_results())
            connection = Mock()
            connection.cursor.return_value = cursor
            real_replace = __import__("os").replace
            calls = 0

            def fail_once(source, destination):
                nonlocal calls
                calls += 1
                if calls == 3:
                    raise OSError("simulated initial publish failure")
                real_replace(source, destination)

            with self.assertRaisesRegex(OSError, "simulated initial publish failure"):
                export_marts(connection, output_dir, replace=fail_once)

            self.assertEqual(list(output_dir.glob("*.csv")), [])
            self.assertFalse(list(output_dir.glob(".mart-export-*")))


if __name__ == "__main__":
    unittest.main()
