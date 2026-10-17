from PIL import Image, ImageDraw
from pathlib import Path
Path('assets').mkdir(exist_ok=True)
im=Image.new('RGBA',(512,512),(0,0,0,0)); d=ImageDraw.Draw(im)
d.rounded_rectangle((8,8,504,504),radius=112,fill='#102744')
d.rounded_rectangle((120,102,392,411),radius=28,fill='#f4f7fb')
d.rounded_rectangle((193,78,319,137),radius=14,fill='#ccaf78')
for y in (191,268,345):
    d.rounded_rectangle((161,y-12,191,y+18),radius=5,outline='#31547c',width=4)
    d.line((224,y+4,347,y+4),fill='#a2b5cb',width=9)
d.line((156,267,173,283,204,247),fill='#237b62',width=12)
im.save('assets/icon.png')
im.save('assets/icon.ico',sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
