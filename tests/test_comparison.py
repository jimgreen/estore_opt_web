import os
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("ESTORE_OPT_WORKER", "1")

import server  # noqa: E402


class ComparisonTableTests(unittest.TestCase):
    def test_comparison_table_preserves_requested_order(self):
        original = server.comparison_items
        try:
            server.comparison_items = lambda: [
                {
                    "id": "opt:a",
                    "type": "optimization",
                    "type_label": "优化求解",
                    "scheme": "A",
                    "metrics": {"fuel_kg": 3.0},
                },
                {
                    "id": "verify:b",
                    "type": "verification",
                    "type_label": "方案校核",
                    "scheme": "B",
                    "metrics": {"fuel_kg": 2.0},
                },
                {
                    "id": "opt:c",
                    "type": "optimization",
                    "type_label": "优化求解",
                    "scheme": "C",
                    "metrics": {"fuel_kg": 1.0},
                },
            ]

            payload = server.comparison_table(["opt:c", "opt:a", "verify:b"])

            self.assertEqual([item["id"] for item in payload["selected"]], ["opt:c", "opt:a", "verify:b"])
        finally:
            server.comparison_items = original


if __name__ == "__main__":
    unittest.main()
