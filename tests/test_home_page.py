import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SYSTEM_TITLE = "考察站风-光-氢-储-柴联合优化调度系统"


class HomePageStructureTests(unittest.TestCase):
    def test_home_page_has_config_selects_and_five_centered_modules(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8-sig")

        self.assertIn(f"<title>{SYSTEM_TITLE}</title>", html)
        self.assertIn(f'>{SYSTEM_TITLE}</h1>', html)
        self.assertIn("data-language-select", html)
        self.assertIn("data-theme-select", html)
        self.assertIn('src="assets/theme.js"', html)
        self.assertEqual(len(re.findall(r'class="home-feature-entry"', html)), 5)

    def test_i18n_uses_requested_system_title(self):
        i18n = (ROOT / "assets" / "i18n.js").read_text(encoding="utf-8-sig")

        self.assertIn(f'"brand": "{SYSTEM_TITLE}"', i18n)
        self.assertIn(f'"home.title": "{SYSTEM_TITLE}"', i18n)

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
