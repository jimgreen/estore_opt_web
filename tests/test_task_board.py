import os
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("ESTORE_OPT_WORKER", "1")

import server  # noqa: E402


class TaskBoardTests(unittest.TestCase):
    def test_task_board_rows_expose_result_name_for_batch_table(self):
        schemes = [{"name": "scheme-a", "description": "demo scheme"}]
        latest = {
            "scheme-a": {
                "id": "task-1",
                "status": "完成计算",
                "result_files": [
                    {"name": "完整结果JSON", "path": "D:/runs/task-1/optimization_result_data.json", "kind": "json"},
                    {"name": "明细工作簿", "path": "D:/runs/task-1/optimization_results_demo.xlsx", "kind": "xlsx"},
                ],
            }
        }

        rows = server.task_board_rows("optimization", schemes, latest)

        self.assertEqual(rows[0]["result_name"], "optimization_results_demo.xlsx")
        self.assertEqual(rows[0]["result_kind"], "xlsx")
        self.assertEqual(rows[0]["scheme_description"], "demo scheme")

    def test_task_board_rows_use_default_result_name_before_task_runs(self):
        schemes = [{"name": "scheme-a", "description": ""}]

        opt_row = server.task_board_rows("optimization", schemes, {})[0]
        verify_row = server.task_board_rows("verification", schemes, {})[0]

        self.assertEqual(opt_row["result_name"], "opt_result.xlsx")
        self.assertEqual(verify_row["result_name"], "verification_timeseries.csv")


if __name__ == "__main__":
    unittest.main()
