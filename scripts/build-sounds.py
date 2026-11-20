"""Cuts keyboard recordings into single strokes and packs each keyboard into one small WAV."""
import sys, os, struct, array, json

SR = 32000

def read_wav(path):
    b = open(path, 'rb').read()
    assert b[:4] == b'RIFF' and b[8:12] == b'WAVE', path
    i = 12; fmt = None; data = None
    while i + 8 <= len(b):
        cid = b[i:i+4]; n = struct.unpack('<I', b[i+4:i+8])[0]
        if cid == b'fmt ': fmt = struct.unpack('<HHIIHH', b[i+8:i+24])
        elif cid == b'data': data = b[i+8:i+8+n]
        i += 8 + n + (n & 1)
    assert fmt and fmt[1] == 1 and fmt[2] == SR and fmt[5] == 16, (path, fmt)
    a = array.array('h'); a.frombytes(data[:len(data)//2*2]); return a

def write_wav(path, a):
    d = a.tobytes()
    with open(path, 'wb') as f:
        f.write(b'RIFF' + struct.pack('<I', 36 + len(d)) + b'WAVE' + b'fmt ' + struct.pack('<IHHIIHH', 16, 1, 1, SR, SR*2, 2, 16) + b'data' + struct.pack('<I', len(d)) + d)

def ms(x): return int(SR * x / 1000)

def tidy(a, max_ms):
    pk = max((abs(x) for x in a), default=0)
    if pk < 200: return None
    start = next(i for i, x in enumerate(a) if abs(x) > pk * 0.04)
    a = a[max(0, start - ms(1)):][:ms(max_ms)]
    # trim the quiet tail, then fade the last few milliseconds
    end = len(a)
    while end > ms(40) and abs(a[end-1]) < pk * 0.01: end -= 1
    a = a[:min(len(a), end + ms(6))]
    f = min(ms(8), len(a))
    for k in range(f): a[len(a)-f+k] = int(a[len(a)-f+k] * (1 - (k+1)/f))
    for k in range(min(ms(0.5), len(a))): a[k] = int(a[k] * k / ms(0.5))
    return a

def level(clips, target):
    pks = sorted(max(abs(x) for x in c) for c in clips)
    med = pks[len(pks)//2]
    out = []
    for c in clips:
        pk = max(abs(x) for x in c)
        # bring every clip toward the middle, but keep some of its own loudness
        g = (target * 32767 / med) * (med / pk) ** 0.5
        out.append(array.array('h', (max(-32767, min(32767, int(x * g))) for x in c)))
    return out

def onsets(a):
    w = ms(2); env = [max(abs(x) for x in a[i:i+w]) for i in range(0, len(a) - w, w)]
    floor = sorted(env)[len(env)//5]; top = sorted(env)[int(len(env)*0.995)]
    thr = floor + (top - floor) * 0.18
    hits = []; quiet = 99
    for i, e in enumerate(env):
        if e > thr:
            if quiet >= 20: hits.append(i * w)   # 40 ms of quiet before it
            quiet = 0
        else: quiet += 1
    return hits

def pack(name, downs, ups, out):
    index = {'down': [], 'up': []}; sprite = array.array('h'); gap = array.array('h', [0] * ms(4))
    for kind, clips in (('down', downs), ('up', ups)):
        for c in clips:
            index[kind].append([round(len(sprite)/SR, 4), round(len(c)/SR, 4)])
            sprite.extend(c); sprite.extend(gap)
    write_wav(os.path.join(out, name + '.wav'), sprite)
    return index

work, out = sys.argv[1], sys.argv[2]
files = sorted(os.listdir(work))
index = {}
for name, prefix in (('creamy', 'Cherry_MX_Red'), ('clacky', 'Gateron_Black'), ('poppy', 'Cherry_MX_Clear')):
    downs = [tidy(read_wav(os.path.join(work, f)), 240) for f in files if f.startswith(prefix + '_down_')]
    ups = [tidy(read_wav(os.path.join(work, f)), 160) for f in files if f.startswith(prefix + '_up_')]
    downs = [c for c in downs if c]; ups = [c for c in ups if c]
    index[name] = pack(name, level(downs, 0.5), level(ups, 0.22) if ups else [], out)

a = read_wav(os.path.join(work, 'hhkb.wav'))
hits = onsets(a)
solo = [h for i, h in enumerate(hits) if i + 1 < len(hits) and hits[i+1] - h > ms(175)]
clips = [tidy(a[h - ms(2): h + ms(175)], 175) for h in solo if h > ms(2)]
clips = [c for c in clips if c]
clips.sort(key=lambda c: max(abs(x) for x in c))
n = len(clips); mid = clips[int(n*0.3): int(n*0.85)]
step = max(1, len(mid) // 32); chosen = mid[::step][:32]
index['thocky'] = pack('thocky', level(chosen, 0.5), [], out)
print('hhkb: onsets', len(hits), 'standing alone', len(solo), 'kept', len(chosen))
json.dump(index, open(os.path.join(out, 'index.json'), 'w'))
for k, v in index.items():
    print(k, 'down', len(v['down']), 'up', len(v['up']), 'file KB', os.path.getsize(os.path.join(out, k + '.wav')) // 1024, 'lengths ms', int(min(d for _, d in v['down'])*1000), '-', int(max(d for _, d in v['down'])*1000))
