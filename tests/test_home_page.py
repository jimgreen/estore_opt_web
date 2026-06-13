import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class HomePageStructureTests(unittest.TestCase):
    def test_home_page_has_config_selects_and_five_centered_modules(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8-sig")

        self.assertIn("data-language-select", html)
        self.assertIn("data-theme-select", html)
        self.assertIn('src="assets/theme.js"', html)
        self.assertEqual(len(re.findall(r'class="home-feature-entry"', html)), 5)

    def test_home_styles_center_last_two_modules_and_define_themes(self):
        css = (ROOT / "assets" / "app.css").read_text(encoding="utf-8-sig")

        self.assertIn(".home-feature-entry:nth-child(4)", css)
        self.assertIn(".home-feature-entry:nth-child(5)", css)
        self.assertIn(".home-feature-grid .home-feature-entry:nth-child(4)", css)
        self.assertIn(".home-feature-grid .home-feature-entry:nth-child(5)", css)
        self.assertIn('[data-theme="aurora"]', css)
        self.assertIn('[data-theme="purple"]', css)
        self.assertIn('[data-theme="workbench"]', css)

    def test_theme_script_is_loaded_by_all_pages(self):
        html_pages = [
            "index.html",
            "schemes.html",
            "solve.html",
            "verify.html",
            "comparison.html",
            "batch.html",
            "login.html",
            "register.html",
        ]

        for page in html_pages:
            with self.subTest(page=page):
                html = (ROOT / page).read_text(encoding="utf-8-sig")
                self.assertIn('src="assets/theme.js"', html)


if __name__ == "__main__":
    unittest.main()
