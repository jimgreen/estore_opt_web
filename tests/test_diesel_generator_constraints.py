import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("ESTORE_OPT_WORKER", "1")

import solve  # noqa: E402


class DieselGeneratorConstraintTests(unittest.TestCase):
    def test_estimate_model_size_counts_one_diesel_online_constraint_per_step(self):
        bp = SimpleNamespace(n_s=2, n_t=3, n_i=4)

        stats = solve.estimate_model_size(bp, n_steps=5, n_dg_units=2, dg_points=3)

        expected_per_step = 46 + bp.n_s + bp.n_t + bp.n_s + bp.n_t + bp.n_s * bp.n_t + 2 * 6 + 1
        self.assertEqual(stats["constraints_est"], 5 * expected_per_step)

    def test_all_solver_builders_add_one_diesel_online_constraint_per_step(self):
        source = (ROOT / "solve.py").read_text(encoding="utf-8-sig")

        self.assertEqual(source.count("dg_at_least_one_on_"), 3)
        self.assertEqual(
            source.count('[(u_dg[g, t], 1.0) for g in range(n_g)], "G", 1.0, f"dg_at_least_one_on_{t}"'),
            2,
        )
        self.assertIn('sum(u_dg[g, t] for g in range(n_g)) >= 1.0, name=f"dg_at_least_one_on_{t}"', source)


if __name__ == "__main__":
    unittest.main()
