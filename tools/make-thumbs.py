#!/usr/bin/env python3
"""从 assets/portrait/*.webp 生成 128×160 的头像缩略图到 assets/portrait/s/。

首屏的 7 个小头像只有 32~44px，直接用 512×640 的原图等于白下载 5 倍的数据。
换立绘之后重跑一次这个脚本，然后跑测试确认。

  python3 tools/make-thumbs.py
"""
import os, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC  = os.path.join(ROOT, 'assets', 'portrait')
DST  = os.path.join(SRC, 's')
W, H = 128, 160

os.makedirs(DST, exist_ok=True)
made = skipped = 0
for f in sorted(os.listdir(SRC)):
    if not f.endswith('.webp'):
        continue
    src, dst = os.path.join(SRC, f), os.path.join(DST, f)
    if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
        skipped += 1
        continue
    im = Image.open(src).convert('RGB')
    # 必须保持和原图一样的 4:5 比例。CSS 那边是 object-fit:cover + object-position:50% 12%
    # 负责裁剪的，这里再裁一次会让两者对不上、脸被拉变形。
    assert im.size == (512, 640), f'{f} 不是 512x640，先修原图'
    im = im.resize((W, H), Image.LANCZOS)
    im.save(dst, 'WEBP', quality=82, method=6)
    made += 1
    print('  生成', f, str(os.path.getsize(dst) // 1024) + 'KB')

# 原图删了的话，缩略图也跟着删，免得留下对不上的孤儿文件
orphan = 0
have = {f for f in os.listdir(SRC) if f.endswith('.webp')}
for f in list(os.listdir(DST)):
    if f.endswith('.webp') and f not in have:
        os.remove(os.path.join(DST, f)); orphan += 1
        print('  删除孤儿', f)

print(f'完成：新增/更新 {made}，跳过 {skipped}，清理 {orphan}')
