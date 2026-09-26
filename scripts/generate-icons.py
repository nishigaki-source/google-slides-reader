#!/usr/bin/env python3
"""
拡張機能アイコンを生成する（Pillow が必要: `pip install pillow`）。
「読」の字の右に音の波を添えて、「スライドを読み上げる」ことをそのままモチーフにしている。
配色・形はルビふり for Googleスライドにそろえる（黒の角丸に白）。

512x512 のマスターを描いてから縮小することで、16px でも潰れにくく仕上がる。
使い方: python3 scripts/generate-icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONT_PATH = "/System/Library/Fonts/Hiragino Sans GB.ttc"
FONT_INDEX_BOLD = 2  # Hiragino Sans GB W6（太字）
MASTER_SIZE = 512
BG_COLOR = (0, 0, 0, 255)
FG_COLOR = (255, 255, 255, 255)


def build_master() -> Image.Image:
    img = Image.new("RGBA", (MASTER_SIZE, MASTER_SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([0, 0, MASTER_SIZE, MASTER_SIZE], radius=100, fill=BG_COLOR)

    # 「読」を左に寄せ、右に音の波の余白を作る
    font = ImageFont.truetype(FONT_PATH, 270, index=FONT_INDEX_BOLD)
    kanji = "読"
    bbox = draw.textbbox((0, 0), kanji, font=font)
    kw, kh = bbox[2] - bbox[0], bbox[3] - bbox[1]
    cx, cy = MASTER_SIZE * 0.38, MASTER_SIZE * 0.52
    draw.text((cx - kw / 2 - bbox[0], cy - kh / 2 - bbox[1]), kanji, font=font, fill=FG_COLOR)

    # 音の波（字の右に広がる 3 本の弧。「声が出ている」形）
    ox, oy = MASTER_SIZE * 0.62, cy
    for r in (62, 104, 146):
        draw.arc([ox - r, oy - r, ox + r, oy + r], start=-42, end=42, fill=FG_COLOR, width=24)
    return img


def main() -> None:
    master = build_master()
    (ROOT / "design").mkdir(exist_ok=True)
    master.save(ROOT / "design" / "icon-master-512.png")

    icons_dir = ROOT / "icons"
    icons_dir.mkdir(parents=True, exist_ok=True)
    for size in (16, 32, 48, 128):
        master.resize((size, size), Image.LANCZOS).save(icons_dir / f"icon{size}.png")
    print(f"Wrote icon16/32/48/128.png to {icons_dir} and design/icon-master-512.png")


if __name__ == "__main__":
    main()
