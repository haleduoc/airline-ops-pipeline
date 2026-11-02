import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from ingestion import load_data


class TransactionTests(unittest.TestCase):
    def make_cursor(self, events, fail_on=None):
        cursor = Mock()
        cursor.fetchone.return_value = None

        def execute(sql, params=None):
            events.append(("execute", sql, params))
            if fail_on and fail_on in sql:
                raise RuntimeError(f"failure at {fail_on}")
            if sql == "BEGIN":
                return
            if sql.startswith("MERGE INTO") and "INGEST_AUDIT" not in sql:
                cursor.description = [("rows_inserted",)]
                cursor.fetchall.return_value = [(1,)]
            elif "DESCRIBE TABLE" in sql:
                cursor.fetchall.return_value = [
                    ("Year", "NUMBER"), ("Month", "NUMBER"), ("Value", "NUMBER")
                ]
            elif sql.startswith("COPY INTO"):
                cursor.fetchall.return_value = [(None, None, None, 2)]
            else:
                cursor.fetchall.return_value = []

        cursor.execute.side_effect = execute
        return cursor

    def test_data_merge_audit_and_commit_share_one_transaction(self):
        events = []
        cursor = self.make_cursor(events)
        connection = Mock()
        merge_sql = "MERGE INTO target USING (SELECT DISTINCT x) ON EQUAL_NULL(x, x)"

        result, description = load_data.merge_and_update_audit(
            connection, cursor, "MERGE INTO audit", ("file",), merge_sql
        )

        sql_events = [event[1] for event in events]
        self.assertEqual(sql_events, [
            "BEGIN", merge_sql, "MERGE INTO audit",
        ])
        connection.commit.assert_called_once_with()
        connection.rollback.assert_not_called()
        self.assertEqual(result, [(1,)])
        self.assertEqual(description, [("rows_inserted",)])

    def test_merge_audit_and_commit_errors_rollback_and_reraise(self):
        for fail_on in ("MERGE INTO target", "MERGE INTO audit", "commit"):
            with self.subTest(fail_on=fail_on):
                cursor = Mock()
                cursor.execute.side_effect = lambda sql, params=None: (
                    (_ for _ in ()).throw(RuntimeError(f"failure at {fail_on}"))
                    if fail_on in sql
                    else None
                )
                connection = Mock()
                if fail_on == "commit":
                    connection.commit.side_effect = RuntimeError("failure at commit")
                with self.assertRaisesRegex(RuntimeError, f"failure at {fail_on}") as caught:
                    load_data.merge_and_update_audit(
                        connection,
                        cursor,
                        "MERGE INTO audit",
                        ("file",),
                        "MERGE INTO target",
                    )
                connection.rollback.assert_called_once_with()
                if fail_on == "commit":
                    self.assertIn("outcome may be uncertain", caught.exception.__notes__[0])

    def test_rollback_error_does_not_hide_original_error(self):
        cursor = Mock()
        cursor.execute.side_effect = [None, RuntimeError("original failure")]
        connection = Mock()
        connection.rollback.side_effect = RuntimeError("rollback failure")
        with self.assertRaisesRegex(RuntimeError, "original failure") as caught:
            load_data.merge_and_update_audit(
                connection, cursor, "MERGE INTO audit", (), "MERGE INTO target"
            )
        self.assertIn("Rollback also failed", caught.exception.__notes__[0])

    def test_empty_csv_is_rejected_before_connecting(self):
        with tempfile.TemporaryDirectory() as temp:
            csv_path = Path(temp) / "empty.csv"
            csv_path.write_text("Year,Month,Value\n", encoding="utf-8")
            with patch.object(load_data.snowflake.connector, "connect") as connect:
                with self.assertRaisesRegex(ValueError, "no data rows"):
                    load_data.load_csv(csv_path, "DB", "SCHEMA", "TABLE", {})
                connect.assert_not_called()

    def test_full_row_null_deduplication_contract_for_empty_and_populated_target(self):
        header = ["Year", "Month", "Value"]
        statement = load_data.build_merge_statement('"DB"."S"."T"', '"STAGE"', header)
        self.assertIn("SELECT DISTINCT", statement)
        self.assertIn('EQUAL_NULL(t."Value", s."Value")', statement)

        duplicate_with_null = (2025, 7, None)
        staged = [duplicate_with_null, duplicate_with_null]

        def apply_merge_model(target_rows):
            inserted = 0
            for row in dict.fromkeys(staged):
                if not any(existing == row for existing in target_rows):
                    target_rows.append(row)
                    inserted += 1
            return inserted

        empty_target = []
        self.assertEqual(apply_merge_model(empty_target), 1)
        self.assertEqual(empty_target, [duplicate_with_null])

        populated_target = [duplicate_with_null]
        self.assertEqual(apply_merge_model(populated_target), 0)
        self.assertEqual(populated_target, [duplicate_with_null])


class LoadLifecycleTests(unittest.TestCase):
    def test_staging_precedes_begin_and_connection_uses_autocommit_false(self):
        with tempfile.TemporaryDirectory() as temp:
            csv_path = Path(temp) / "07_2025.csv"
            csv_path.write_text(
                "Year,Month,Value\n2025,7,1\n2025,7,2\n", encoding="utf-8"
            )
            events = []
            cursor = TransactionTests().make_cursor(events)
            connection = Mock()
            connection.cursor.return_value = cursor

            with patch.object(
                load_data.snowflake.connector, "connect", return_value=connection
            ) as connect:
                load_data.load_csv(csv_path, "DB", "SCHEMA", "TABLE", {})

            self.assertIs(connect.call_args.kwargs["autocommit"], False)
            executed_sql = [event[1] for event in events]
            self.assertLess(
                next(i for i, sql in enumerate(executed_sql) if sql.startswith("COPY INTO")),
                executed_sql.index("BEGIN"),
            )
            connection.commit.assert_called_once_with()
            cursor.close.assert_called_once_with()
            connection.close.assert_called_once_with()

    def test_audit_failure_rolls_back_and_closes_resources(self):
        with tempfile.TemporaryDirectory() as temp:
            csv_path = Path(temp) / "07_2025.csv"
            csv_path.write_text(
                "Year,Month,Value\n2025,7,1\n2025,7,2\n", encoding="utf-8"
            )
            events = []
            audit_merge = '"TABLE_INGEST_AUDIT" a USING'
            cursor = TransactionTests().make_cursor(events, fail_on=audit_merge)
            connection = Mock()
            connection.cursor.return_value = cursor

            with patch.object(
                load_data.snowflake.connector, "connect", return_value=connection
            ) as connect:
                with self.assertRaisesRegex(RuntimeError, "TABLE_INGEST_AUDIT"):
                    load_data.load_csv(csv_path, "DB", "SCHEMA", "TABLE", {})

            self.assertIs(connect.call_args.kwargs["autocommit"], False)
            connection.rollback.assert_called_once_with()
            connection.commit.assert_not_called()
            cursor.close.assert_called_once_with()
            connection.close.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
