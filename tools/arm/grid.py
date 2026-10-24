"""Paste images side by side: python3 -I grid.py OUT cols IN..."""
import sys
from PIL import Image
out, cols, files = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
ims = [Image.open(f).convert('RGB') for f in files]
w = max(i.width for i in ims); h = max(i.height for i in ims)
rows = (len(ims) + cols - 1) // cols
s = Image.new('RGB', (w * cols, h * rows), (30, 30, 30))
for k, im in enumerate(ims):
    s.paste(im, ((k % cols) * w, (k // cols) * h))
s.save(out)
