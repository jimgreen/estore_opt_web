import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import solve  # noqa: E402


class SocBreakpointTests(unittest.TestCase):
    def test_soc_breakpoints_use_only_operating_bounds_and_interpolate_tables(self):
        soc_source = np.asarray([0.0, 0.25, 0.5, 0.75, 1.0], dtype=float)
        temp_source = np.asarray([0.0, 10.0], dtype=float)
        r0_table = np.asarray([[soc * 100.0 + temp for temp in temp_source] for soc in soc_source], dtype=float)
        p = SimpleNamespace(
            SOC_min=0.2,
            SOC_max=0.8,
            soc_pts=soc_source,
            ocv_soc=soc_source,
            ocv_1d=3.0 + soc_source,
            temp_pts=temp_source,
            r0_table=r0_table,
            T_bat_min=0.0,
            T_bat_max=10.0,
            current_limit_temps=temp_source,
            charge_current_limit_pack=np.asarray([100.0, 100.0], dtype=float),
            discharge_current_limit_pack=np.asarray([120.0, 120.0], dtype=float),
            I_charge_max=100.0,
            I_discharge_max=120.0,
            Q_nom=100.0,
        )

        bp = solve.make_breakpoints(p, "test_1h", current_segments=2, soc_grid_width=0.3)

        np.testing.assert_allclose(bp.soc, [0.2, 0.5, 0.8])
        self.assertGreaterEqual(float(np.min(bp.soc)), p.SOC_min)
        self.assertLessEqual(float(np.max(bp.soc)), p.SOC_max)
        np.testing.assert_allclose(bp.ocv, [3.2, 3.5, 3.8])
        np.testing.assert_allclose(bp.r0, [[20.0, 30.0], [50.0, 60.0], [80.0, 90.0]])


if __name__ == "__main__":
    unittest.main()
