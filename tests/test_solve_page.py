import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class SolvePageResultLayoutTests(unittest.TestCase):
    def test_result_tabs_are_consolidated(self):
        html = (ROOT / "solve.html").read_text(encoding="utf-8-sig")

        self.assertIn('data-result-tab="logs"', html)
        self.assertIn('data-result-tab="overview"', html)
        self.assertIn('data-result-tab="curves"', html)
        self.assertIn(">结果总览</button>", html)
        self.assertNotIn('data-result-tab="green"', html)
        self.assertNotIn('data-result-tab="safety"', html)
        self.assertNotIn('id="greenResult"', html)
        self.assertNotIn('id="safetyResult"', html)

    def test_overview_renderer_owns_economic_and_safety_sections(self):
        script = (ROOT / "assets" / "solve.js").read_text(encoding="utf-8-sig")

        self.assertIn("result-overview-workbench", script)
        self.assertIn("result-section-title", script)
        self.assertIn("经济性", script)
        self.assertIn("安全性", script)
        self.assertNotIn("renderEconomic(task, metrics)", script)
        self.assertNotIn("renderSafety(task, metrics)", script)

    def test_curve_tree_supports_multi_select_rendering(self):
        script = (ROOT / "assets" / "solve.js").read_text(encoding="utf-8-sig")
        css = (ROOT / "assets" / "app.css").read_text(encoding="utf-8-sig")

        self.assertIn("selectedCurveKeys", script)
        self.assertIn("curve-tree", script)
        self.assertIn("curve-tree-node", script)
        self.assertIn("renderMultiLineChart", script)
        self.assertIn('type="checkbox"', script)
        self.assertIn(".curve-tree-node::before", css)
        self.assertIn(".curve-tree-node::after", css)
        self.assertIn("border: 0", css)


if __name__ == "__main__":
    unittest.main()
