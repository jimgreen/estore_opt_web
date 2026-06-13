import os
import shutil
import sys
import tempfile
import unittest
import uuid
from pathlib import Path

import openpyxl


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("ESTORE_OPT_WORKER", "1")

import server  # noqa: E402
import solve  # noqa: E402


PARAMS_PATH = ROOT / "estore_schemes" / "2" / "params.xlsx"
DISPATCH_SHEET = "\u8c03\u5ea6\u63a7\u5236\u66f2\u7ebf"


class GuardedSolver:
    def __getattr__(self, name):
        if name == "solve_with_backend":
            raise AssertionError("\u65b9\u6848\u6821\u6838\u4e0d\u5e94\u8c03\u7528\u4f18\u5316\u6c42\u89e3\u5668")
        return getattr(solve, name)


class DispatchScheduleTests(unittest.TestCase):
    def test_dispatch_schedule_is_independent_xlsx_and_round_trips_controls(self):
        p = solve.load_params(PARAMS_PATH)
        rows = [
            {
                "hour": 0.0,
                "cell_current_a": 1.5,
                "u_pi": 1,
                "u_po": 0,
                "u_lh": 1,
                "p_heat_liquid_kw": 0.4,
                "u_ch": 0,
                "p_heat_cont_kw": 0.0,
                "soc_ref": 0.5,
            },
            {
                "hour": 0.25,
                "cell_current_a": -0.5,
                "u_pi": 0,
                "u_po": 1,
                "u_lh": 0,
                "p_heat_liquid_kw": 0.0,
                "u_ch": 1,
                "p_heat_cont_kw": 0.3,
                "soc_ref": 0.49,
            },
        ]
        with tempfile.TemporaryDirectory() as tmp:
            dispatch_path = Path(tmp) / server.DISPATCH_SCHEDULE_FILE_NAME
            server.write_dispatch_schedule_workbook(dispatch_path, rows, p)

            self.assertTrue(dispatch_path.exists())
            self.assertFalse((Path(tmp) / server.PARAM_FILE_NAME).exists())
            wb = openpyxl.load_workbook(dispatch_path, data_only=True)
            self.assertIn(DISPATCH_SHEET, wb.sheetnames)
            headers = [cell.value for cell in wb[DISPATCH_SHEET][1]]
            self.assertIn("\u7535\u82af\u7535\u6d41(A)", headers)
            self.assertIn("\u6db2\u51b7\u7535\u52a0\u70ed\u529f\u7387(kW)", headers)

            loaded = server.read_dispatch_schedule_workbook(dispatch_path, p)
            self.assertEqual(len(loaded["rows"]), 2)
            self.assertAlmostEqual(loaded["rows"][0]["pack_current_a"], 1.5 * int(p.N_p))
            self.assertEqual(loaded["rows"][1]["u_po"], 1.0)
            self.assertAlmostEqual(loaded["rows"][1]["p_heat_cont_kw"], 0.3)

    def test_dispatch_schedule_can_be_created_from_optimization_result_payload(self):
        p = solve.load_params(PARAMS_PATH)
        result_payload = {
            "rows": [
                {"hour": 0.0, "I_bat": 0.0, "SOC": 0.5, "T_bat": 10.0, "P_BESS": 0.0, "pv_use_kw": 1.0, "wt_use_kw": 2.0, "P_dg": 3000.0, "u_pi": 1.0, "u_po": 0.0, "u_lh": 1.0, "u_ch": 0.0, "P_heat_liquid_w": 400.0, "P_heat_cont_w": 0.0},
                {"hour": 0.25, "I_bat": 30.0, "SOC": 0.49, "T_bat": 10.2, "P_BESS": 15000.0, "pv_use_kw": 1.5, "wt_use_kw": 2.5, "P_dg": 1000.0, "u_pi": 1.0, "u_po": 1.0, "u_lh": 0.0, "u_ch": 1.0, "P_heat_liquid_w": 0.0, "P_heat_cont_w": 500.0},
            ]
        }

        rows = server.dispatch_rows_from_result_data(result_payload, p)

        self.assertEqual(len(rows), 2)
        self.assertAlmostEqual(rows[1]["cell_current_a"], 30.0 / int(p.N_p))
        self.assertAlmostEqual(rows[1]["p_heat_cont_kw"], 0.5)
        self.assertAlmostEqual(rows[1]["pbess_ref_kw"], 15.0)
        self.assertAlmostEqual(rows[1]["dg_ref_kw"], 1.0)

    def test_create_dispatch_scheme_from_optimization_writes_independent_workbook(self):
        task_id = f"test-dispatch-{uuid.uuid4().hex[:10]}"
        target_name = f"test_dispatch_scheme_{uuid.uuid4().hex[:10]}"
        run_dir = server.RUN_ROOT / task_id
        target_dir = server.scheme_dir(target_name)
        try:
            run_dir.mkdir(parents=True, exist_ok=True)
            server.write_json(run_dir / "run_manifest.json", {"scheme": "2"})
            server.write_json(
                run_dir / server.RESULT_DATA_FILE_NAME,
                {
                    "rows": [
                        {
                            "hour": 0.0,
                            "I_bat": 24.0,
                            "SOC": 0.5,
                            "T_bat": 10.0,
                            "T_tank": 8.0,
                            "T_cont": 6.0,
                            "P_BESS": 12000.0,
                            "pv_use_kw": 2.0,
                            "wt_use_kw": 3.0,
                            "P_dg": 4000.0,
                            "u_pi": 1.0,
                            "u_po": 1.0,
                            "u_lh": 1.0,
                            "u_ch": 0.0,
                            "P_heat_liquid_w": 500.0,
                            "P_heat_cont_w": 0.0,
                        }
                    ]
                },
            )

            scheme = server.create_dispatch_scheme_from_optimization(task_id, target_name, "from test optimization")

            dispatch_path = server.scheme_dispatch_schedule_path(scheme["name"])
            self.assertTrue(dispatch_path.exists())
            self.assertTrue(server.scheme_params_path(scheme["name"]).exists())
            self.assertNotEqual(dispatch_path.name, server.PARAM_FILE_NAME)
            loaded = server.read_dispatch_schedule_workbook(dispatch_path, solve.load_params(PARAMS_PATH))
            self.assertEqual(len(loaded["rows"]), 1)
            self.assertAlmostEqual(loaded["rows"][0]["pack_current_a"], 24.0)
            self.assertAlmostEqual(loaded["rows"][0]["p_heat_liquid_kw"], 0.5)
        finally:
            if run_dir.exists():
                shutil.rmtree(run_dir)
            if target_dir.exists():
                shutil.rmtree(target_dir)

    def test_scheme_verification_uses_time_domain_simulation_not_optimization(self):
        p = solve.load_params(PARAMS_PATH)
        rows = []
        for step in range(4):
            rows.append(
                {
                    "hour": step * 0.25,
                    "cell_current_a": 0.0,
                    "u_pi": 0,
                    "u_po": 0,
                    "u_lh": 0,
                    "p_heat_liquid_kw": 0.0,
                    "u_ch": 0,
                    "p_heat_cont_kw": 0.0,
                    "soc_ref": p.SOC_init,
                    "t_bat_ref_c": p.T_bat_init,
                    "t_tank_ref_c": p.T_tank_init,
                    "t_cont_ref_c": p.T_cont_init,
                    "pbess_ref_kw": 0.0,
                }
            )
        original_loader = server.load_solver_module
        try:
            server.load_solver_module = lambda: GuardedSolver()
            with tempfile.TemporaryDirectory() as tmp:
                tmp_path = Path(tmp)
                dispatch_path = tmp_path / server.DISPATCH_SCHEDULE_FILE_NAME
                server.write_dispatch_schedule_workbook(dispatch_path, rows, p)

                payload = server.run_scheme_verification(
                    PARAMS_PATH,
                    {"dt_minutes": 15, "hours": 1, "tight_temp_bounds": True},
                    tmp_path / "verification",
                    dispatch_path=dispatch_path,
                )
        finally:
            server.load_solver_module = original_loader

        metrics = payload["metrics"]
        self.assertEqual(metrics["status"], "SIMULATED")
        self.assertIn("diesel", metrics)
        self.assertIn("renewable", metrics)
        self.assertIn("violations", metrics)
        self.assertGreaterEqual(metrics["diesel"]["fuel_kg"], 0.0)
        self.assertIn("pv_use_actual_kw", payload["rows"][0])
        self.assertIn("soc_violation", payload["rows"][0])

    def test_scheme_verification_requires_dispatch_schedule_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(FileNotFoundError, "dispatch_schedule.xlsx"):
                server.run_scheme_verification(
                    PARAMS_PATH,
                    {"dt_minutes": 15, "hours": 1},
                    Path(tmp),
                    dispatch_path=Path(tmp) / server.DISPATCH_SCHEDULE_FILE_NAME,
                )

    def test_verification_summary_describes_time_domain_simulation(self):
        payload = {
            "config": {
                "mode": "dayahead_24h",
                "dt_minutes": 15,
                "horizon_hours": 72,
                "dispatch_schedule": "dispatch_schedule.xlsx",
                "calculation": "time_domain_simulation",
            },
            "metrics": {
                "status": "SIMULATED",
                "steps": 288,
                "dt_minutes": 15,
                "soc": {"max_abs": 0.01, "mae": 0.002, "rmse": 0.003, "final": 0.001},
                "t_bat_c": {"max_abs": None, "mae": None, "rmse": None, "final": None},
                "t_tank_c": {"max_abs": None, "mae": None, "rmse": None, "final": None},
                "t_cont_c": {"max_abs": None, "mae": None, "rmse": None, "final": None},
                "pbess_kw": {"max_abs": 1.2, "mae": 0.4, "rmse": 0.5, "final": -0.1},
                "diesel": {"fuel_kg": 12.3, "max_kw": 45.0},
                "renewable": {"pv_use_kwh": 8.0, "wt_use_kwh": 9.0, "pv_curt_kwh": 1.0, "wt_curt_kwh": 2.0, "unserved_kwh": 0.0},
                "violations": {"soc_max": 0.0, "charge_current_max_a": 0.0, "discharge_current_max_a": 0.0, "t_bat_max_c": 0.0, "t_tank_max_c": 0.0, "t_cont_max_c": 0.0, "power_balance_max_kw": 0.01},
            },
        }

        text = server.verification_summary_text(payload)

        self.assertIn("时域仿真", text)
        self.assertIn("柴油实际耗油", text)
        self.assertIn("新能源实际消纳", text)
        self.assertNotIn("求解器", text)
        self.assertNotIn("目标函数", text)

    def test_flatten_verification_metrics_exposes_simulation_assessment_fields(self):
        metrics = {
            "status": "SIMULATED",
            "steps": 4,
            "dt_minutes": 15,
            "soc": {"max_abs": 0.01, "mae": 0.002, "rmse": 0.003},
            "pbess_kw": {"max_abs": 1.2, "mae": 0.4},
            "diesel": {"fuel_kg": 12.3, "max_kw": 45.0},
            "renewable": {"pv_use_kwh": 8.0, "wt_use_kwh": 9.0, "pv_curt_kwh": 1.0, "wt_curt_kwh": 2.0, "unserved_kwh": 0.25},
            "violations": {"soc_max": 0.1, "charge_current_max_a": 2.0, "discharge_current_max_a": 3.0, "t_bat_max_c": 4.0, "power_balance_max_kw": 0.01},
        }

        flattened = server.flatten_verification_metrics(metrics)

        self.assertEqual(flattened["fuel_kg"], 12.3)
        self.assertEqual(flattened["diesel_max_kw"], 45.0)
        self.assertEqual(flattened["renewable_use_kwh"], 17.0)
        self.assertEqual(flattened["renewable_curt_kwh"], 3.0)
        self.assertEqual(flattened["unserved_kwh"], 0.25)
        self.assertEqual(flattened["soc_violation_max"], 0.1)
        self.assertEqual(flattened["charge_current_violation_max_a"], 2.0)
        self.assertEqual(flattened["discharge_current_violation_max_a"], 3.0)
        self.assertEqual(flattened["t_bat_violation_max_c"], 4.0)


if __name__ == "__main__":
    unittest.main()
