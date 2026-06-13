import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("ESTORE_OPT_WORKER", "1")

import solve  # noqa: E402
import server  # noqa: E402


CELL_STATE_SHEET = "\u7535\u82af\u72b6\u6001"


def sample_params() -> SimpleNamespace:
    return SimpleNamespace(
        N_s=2,
        N_p=3,
        ocv_soc=np.asarray([0.0, 1.0], dtype=float),
        ocv_1d=np.asarray([600.0, 720.0], dtype=float),
        ocv_cell_1d=np.asarray([3.0, 3.6], dtype=float),
        mu_pcs=0.02,
        P_pump_in=100.0,
        P_pump_out=120.0,
        P_heat_liquid=500.0,
        P_heat_cont=600.0,
        m_in=0.5,
        m_out=0.4,
        c_liq=4200.0,
    )


def sample_result() -> dict:
    n = 3
    return {
        "success": True,
        "status": "OPTIMAL",
        "objective": 12.5,
        "gap": 0.01,
        "best_bound": 12.4,
        "time_s": 3.2,
        "node_count": 7,
        "fuel_kg": 4.5,
        "curt_kwh": 1.2,
        "heat_kwh": 0.8,
        "solver_used": "unit-test",
        "solver_backend": "mock",
        "hours": np.asarray([0.0, 0.25, 0.5], dtype=float),
        "SOC": np.asarray([0.2, 0.3, 0.4], dtype=float),
        "T_bat": np.asarray([10.0, 11.0, 12.0], dtype=float),
        "T_tank": np.asarray([5.0, 5.5, 6.0], dtype=float),
        "T_cont": np.asarray([2.0, 2.5, 3.0], dtype=float),
        "T_amb": np.asarray([-8.0, -7.5, -7.0], dtype=float),
        "I_bat": np.asarray([0.0, 10.0, -5.0], dtype=float),
        "R0": np.asarray([0.08, 0.081, 0.082], dtype=float),
        "P_dc_pack": np.asarray([0.0, 5900.0, -3100.0], dtype=float),
        "P_dc_abs": np.asarray([0.0, 5900.0, 3100.0], dtype=float),
        "Q_gen_pack": np.asarray([0.0, 8.1, 2.05], dtype=float),
        "P_BESS": np.asarray([0.0, 5682.0, -3162.0], dtype=float),
        "Q_bt": np.asarray([0.0, 20.0, 25.0], dtype=float),
        "Q_tamb": np.asarray([0.0, 15.0, 18.0], dtype=float),
        "Q_tamb_dump": np.asarray([0.0, 1.0, 2.0], dtype=float),
        "u_pi": np.asarray([0.0, 1.0, 1.0], dtype=float),
        "u_po": np.asarray([0.0, 0.0, 1.0], dtype=float),
        "u_lh": np.asarray([0.0, 1.0, 0.0], dtype=float),
        "u_ch": np.asarray([0.0, 0.0, 1.0], dtype=float),
        "pv_use_kw": np.asarray([0.0, 3.0, 4.0], dtype=float),
        "wt_use_kw": np.asarray([0.0, 2.0, 0.0], dtype=float),
        "P_dg": np.asarray([1000.0, 2000.0, 1500.0], dtype=float),
        "load_kw": np.asarray([1.0, 10.0, 8.0], dtype=float),
        "P_dg_units": np.asarray([[1000.0, 2000.0, 1500.0], [0.0, 0.0, 0.0]], dtype=float),
        "u_dg": np.asarray([[1.0, 1.0, 1.0], [0.0, 0.0, 0.0]], dtype=float),
        "custom_curve": np.asarray([3.0, 4.0, 5.0], dtype=float),
        "model_stats": {"variables_total": 30, "constraints_total": 12, "steps": n, "dt_minutes": 15},
        "checks": {"soc_min": 0.2, "soc_max": 0.4, "model_balance_max_kw": 0.001},
    }


class ResultOutputTests(unittest.TestCase):
    def test_result_data_payload_exports_all_time_series_tables_and_statistics(self):
        payload = solve.build_result_data_payload(sample_params(), sample_result())

        series_by_key = {item["key"]: item for item in payload["series"]}
        self.assertEqual(payload["row_count"], 3)
        self.assertIn("SOC", series_by_key)
        self.assertIn("P_BESS", series_by_key)
        self.assertIn("custom_curve", series_by_key)
        self.assertIn("P_dg_units_1", series_by_key)
        self.assertEqual(payload["rows"][2]["SOC"], 0.4)
        self.assertEqual(payload["statistics"]["objective"], 12.5)
        self.assertEqual(payload["statistics"]["checks"]["soc_min"], 0.2)
        self.assertEqual(payload["statistics"]["model_stats"]["variables_total"], 30)
        self.assertEqual(len(payload["tables"][CELL_STATE_SHEET]["rows"]), 3)

    def test_write_result_data_files_writes_json_statistics_and_csv(self):
        with tempfile.TemporaryDirectory() as tmp:
            files = solve.write_result_data_files(sample_params(), sample_result(), Path(tmp))

            result_data = Path(files["result_data"])
            statistics = Path(files["statistics"])
            timeseries_csv = Path(files["timeseries_csv"])
            self.assertTrue(result_data.exists())
            self.assertTrue(statistics.exists())
            self.assertTrue(timeseries_csv.exists())

            payload = json.loads(result_data.read_text(encoding="utf-8"))
            stats = json.loads(statistics.read_text(encoding="utf-8"))
            csv_lines = timeseries_csv.read_text(encoding="utf-8-sig").splitlines()
            self.assertEqual(payload["row_count"], 3)
            self.assertEqual(stats["objective"], 12.5)
            self.assertIn("custom_curve", csv_lines[0])
            self.assertEqual(len(csv_lines), 4)

    def test_server_reads_result_data_and_file_links_from_run_dir(self):
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp)
            (run_dir / "optimization_result_data.json").write_text(
                json.dumps({"series": [{"key": "SOC"}], "rows": [{"hour": 0.0, "SOC": 0.2}], "statistics": {"objective": 1.0}}),
                encoding="utf-8",
            )
            (run_dir / "optimization_statistics.json").write_text(json.dumps({"objective": 1.0}), encoding="utf-8")
            (run_dir / "optimization_timeseries.csv").write_text("hour,SOC\n0,0.2\n", encoding="utf-8-sig")
            (run_dir / "optimization_results_perspective_i2r_15min_20260530.xlsx").write_text("", encoding="utf-8")

            payload = server.optimization_result_payload(run_dir, {"objective": 1.0}, {"variables_total": 5})

            self.assertEqual(payload["result_data"]["series"][0]["key"], "SOC")
            self.assertEqual(payload["statistics"]["objective"], 1.0)
            labels = {item["label"] for item in payload["result_files"]}
            self.assertIn("\u5b8c\u6574\u7ed3\u679cJSON", labels)
            self.assertIn("\u65f6\u5e8f\u66f2\u7ebfCSV", labels)
            self.assertIn("\u660e\u7ec6\u5de5\u4f5c\u7c3f", labels)


if __name__ == "__main__":
    unittest.main()
