"""Generate the Tooltician social preview asset as SVG."""

from __future__ import annotations

from pathlib import Path

SVG_TEMPLATE = """<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1200\" height=\"630\" viewBox=\"0 0 1200 630\" role=\"img\" aria-labelledby=\"title desc\">
  <title id=\"title\">Tooltician social preview</title>
  <desc id=\"desc\">Dark card with Tooltician brand title and tagline on a stylised market trendline.</desc>
  <defs>
    <linearGradient id=\"bg-gradient\" x1=\"0%\" y1=\"0%\" x2=\"100%\" y2=\"100%\">
      <stop offset=\"0%\" stop-color=\"#0f172a\" />
      <stop offset=\"100%\" stop-color=\"#111827\" />
    </linearGradient>
    <linearGradient id=\"line-gradient\" x1=\"0%\" y1=\"0%\" x2=\"100%\" y2=\"0%\">
      <stop offset=\"0%\" stop-color=\"#0ea5e9\" />
      <stop offset=\"100%\" stop-color=\"#2563eb\" />
    </linearGradient>
    <filter id=\"glow\" x=\"-20\" y=\"-20\" width=\"1240\" height=\"670\" filterUnits=\"userSpaceOnUse\">
      <feGaussianBlur in=\"SourceGraphic\" stdDeviation=\"12\" result=\"blur\" />
      <feMerge>
        <feMergeNode in=\"blur\" />
        <feMergeNode in=\"SourceGraphic\" />
      </feMerge>
    </filter>
  </defs>
  <rect width=\"1200\" height=\"630\" fill=\"url(#bg-gradient)\" />
  <rect x=\"80\" y=\"140\" width=\"1040\" height=\"350\" rx=\"24\" ry=\"24\" fill=\"none\" stroke=\"#0ea5e9\" stroke-width=\"6\" />
  <polyline
    points=\"140 360 280 280 420 340 560 240 700 320 840 220 980 300\"
    fill=\"none\"
    stroke=\"url(#line-gradient)\"
    stroke-width=\"14\"
    stroke-linecap=\"round\"
    stroke-linejoin=\"round\"
    filter=\"url(#glow)\"
    opacity=\"0.85\"
  />
  <g fill=\"#f8fafc\" font-family=\"'Inter', 'Segoe UI', 'DejaVu Sans', sans-serif\" text-anchor=\"middle\">
    <text x=\"600\" y=\"250\" font-size=\"96\" font-weight=\"700\">Tooltician</text>
    <text x=\"600\" y=\"330\" font-size=\"40\" fill=\"#94a3b8\">Portfolio intelligence for modern investors</text>
  </g>
  <g transform=\"translate(600 430)\" text-anchor=\"middle\" font-family=\"'Inter', 'Segoe UI', 'DejaVu Sans', sans-serif\" fill=\"#cbd5f5\">
    <text font-size=\"26\">Monitor. Optimise. Collaborate.</text>
  </g>
</svg>
"""


def create_social_card(output_path: Path) -> None:
  """Render the branded social card to ``output_path``."""
  output_path.parent.mkdir(parents=True, exist_ok=True)
  output_path.write_text(SVG_TEMPLATE, encoding="utf-8")


def main() -> None:
  """Entry point for CLI execution."""
  destination = Path("public/tooltician-social-card.svg")
  create_social_card(destination)
  size = destination.stat().st_size
  print(f"Generated {destination} ({size} bytes)")


if __name__ == "__main__":
  main()
