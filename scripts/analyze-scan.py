#!/usr/bin/env python3
"""Works through a scan recording of LowRider Control (the zip made by "Aufzeichnung speichern" in the photo map panel).

It answers, from the file alone, what a scan in strips depends on and the app cannot see:

  1. How the pictures and the status reports arrive: rate, jitter, stalls of the page, how long a jog takes to start.
  2. The lag of the pictures behind the reports (what the app calls `stripLag`), its scatter and the scale of the
     positions – measured by following the dense series of a run from picture to picture and fitting it to the
     reports.
  3. How sharp the pictures are at which speed (motion blur).
  4. What the app made of each run: pictures taken, placed, refused, how far the two chains disagreed.
  5. Where the placed pictures really lie: each is set against the pictures at rest (a scan by stops, the anchors)
     that overlap it – the error of the placement, in mm.
  6. Which clock the pictures were put on the time line with (`meta.clock`: the Pi's – the relay stamps the reports and the
     camera server the pictures – or the browser's) and, for a run on the Pi's, the lag and the timing noise of *both* clocks
     from the same placed pictures: the page's (when it saw a report or a picture) against the Pi's (its stamp), and which of
     the two scatters less. A file without stamps (older, or a run on the browser's clock) has only the browser's.

Needs numpy and Pillow.   python3 scripts/analyze-scan.py recording.zip [--json out.json]
"""
import argparse
import io
import json
import math
import sys
import zipfile

import numpy as np
from PIL import Image


# ---------- reading ----------

def load(path):
    z = zipfile.ZipFile(path)
    trace = json.loads(z.read('trace.json'))
    if trace.get('format') != 'lowrider-scan-trace':
        sys.exit('not a LowRider scan recording')
    files = {n: z.read(n) for n in z.namelist() if n != 'trace.json'}
    return trace, files


def gray_of(data, codec, width, height):
    if codec == 'rgba':
        a = np.frombuffer(data, dtype=np.uint8).reshape(height, width, 4)[..., :3].astype(np.float32)
    else:
        a = np.asarray(Image.open(io.BytesIO(data)).convert('RGB'), dtype=np.float32)
    return (a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114)


# ---------- image helpers ----------

def box_mean(a, r):
    """Mean over a (2r+1)² window, edges with what is there."""
    h, w = a.shape
    s = np.zeros((h + 1, w + 1), dtype=np.float64)
    s[1:, 1:] = a.cumsum(0).cumsum(1)
    y0 = np.clip(np.arange(h) - r, 0, h)
    y1 = np.clip(np.arange(h) + r + 1, 0, h)
    x0 = np.clip(np.arange(w) - r, 0, w)
    x1 = np.clip(np.arange(w) + r + 1, 0, w)
    tot = s[y1][:, x1] - s[y0][:, x1] - s[y1][:, x0] + s[y0][:, x0]
    area = (y1 - y0)[:, None] * (x1 - x0)[None, :]
    return (tot / area).astype(np.float32)


def high_pass(a, r):
    return a - box_mean(a, r)


def phase_shift(ref, cur, window=True):
    """(dx, dy, peak): cur(x, y) ~ ref(x + dx, y + dy), to a fraction of a pixel; peak = how clear."""
    h, w = ref.shape
    if window:
        win = np.outer(np.hanning(h), np.hanning(w)).astype(np.float32)
        ref, cur = ref * win, cur * win
    c = np.conj(np.fft.rfft2(cur)) * np.fft.rfft2(ref)
    c /= np.maximum(np.abs(c), 1e-9)
    r = np.fft.irfft2(c, s=(h, w))
    iy, ix = np.unravel_index(int(np.argmax(r)), r.shape)
    peak = float(r[iy, ix])

    def refine(m, p, n):
        a, b, cc = r[(iy if n == 0 else iy - 1) % h, (ix - 1 if n == 0 else ix) % w], r[iy, ix], r[
            (iy if n == 0 else iy + 1) % h, (ix + 1 if n == 0 else ix) % w]
        d = a - 2 * b + cc
        return 0.0 if d >= 0 else max(-0.5, min(0.5, 0.5 * (a - cc) / d))

    fx = refine(None, None, 0)
    fy = refine(None, None, 1)
    dx = ix + fx if ix <= w // 2 else ix - w + fx
    dy = iy + fy if iy <= h // 2 else iy - h + fy
    return dx, dy, peak


def laplacian_variance(a):
    l = (-4 * a[1:-1, 1:-1] + a[:-2, 1:-1] + a[2:, 1:-1] + a[1:-1, :-2] + a[1:-1, 2:])
    return float(l.var())


def resample_to_grid(gray, pose, cal, scale, grid):
    """The frame laid on a grid of machine mm (x right, y up): `grid` = (x0, y0, nx, ny, step)."""
    x0, y0, nx, ny, g = grid
    h, w = gray.shape
    ppm = cal['pxPerMm'] * scale
    r = math.radians(cal['rotation'])
    c, s = math.cos(r), math.sin(r)
    cx, cy = pose
    a = ppm * c * g
    b = -ppm * s * g
    cc = w / 2 + ppm * (c * (x0 - cx) + s * (y0 - cy))
    d = ppm * s * g
    e = ppm * c * g
    f = h / 2 + ppm * (s * (x0 - cx) - c * (y0 - cy))
    img = Image.fromarray(gray.astype(np.float32), mode='F')
    out = img.transform((nx, ny), Image.AFFINE, (a, b, cc, d, e, f), resample=Image.BILINEAR, fillcolor=float('nan'))
    return np.asarray(out, dtype=np.float32)


# ---------- the analysis ----------

def stats(values):
    v = np.asarray(values, dtype=float)
    if v.size == 0:
        return 'n=0'
    return f'n={v.size} mean {v.mean():.2f} sd {v.std():.2f} min {v.min():.2f} max {v.max():.2f}'


def timing(trace):
    out = {}
    reports = trace['reports']
    rt = np.array([r['t'] for r in reports])
    out['reports'] = {'n': len(reports), 'interval_ms': stats(np.diff(rt)) if len(rt) > 1 else 'n=0'}
    # the pictures while the camera moves: the pause between two runs is no interval
    per_scan = {}
    for s in trace['stamps']:
        per_scan.setdefault(s['scan'], []).append(s['t'])
    out['picture_stamps'] = {}
    for scan, ts in per_scan.items():
        d = np.diff(ts)
        d = d[d < 500]
        out['picture_stamps'][scan] = {
            'n': len(ts),
            'interval_ms': stats(d),
            'fps': round(1000 / float(np.median(d)), 1) if len(d) else None,
        }
    out['screen_stalls'] = {'n': len(trace['gaps']), 'longest_ms': max([g[1] for g in trace['gaps']], default=0)}
    jog = {}
    ev = trace['events']
    for i, e in enumerate(ev):
        if e['kind'] == 'jog-send':
            ok = next((x for x in ev[i + 1:] if x['kind'] == 'jog-ok'), None)
            first = next((r for r in reports if r['t'] >= e['t'] and r['state'] == 'Jog'), None)
            jog.setdefault('send_to_ok_ms', []).append(ok['t'] - e['t'] if ok else None)
            jog.setdefault('send_to_first_Jog_report_ms', []).append(first['t'] - e['t'] if first else None)
    out['jog'] = {k: [round(x) if x is not None else None for x in v] for k, v in jog.items()}
    return out


def runs(trace):
    """One entry per jog: its window and the pictures of the dense series inside it."""
    out = []
    ev = trace['events']
    for i, e in enumerate(ev):
        if e['kind'] != 'jog-send':
            continue
        end = next((x for x in ev[i + 1:] if x['kind'] == 'jog-end'), None)
        solved = next((x for x in ev[i + 1:] if x['kind'] == 'solved'), None)
        out.append({'send': e, 'end_t': end['t'] if end else None, 'scan': e['scan'], 'solved': solved})
    return out


def follow_run(trace, files, run, meta):
    """The dense series of a run followed from picture to picture: where it lies along the strip (relative, mm), in
    stretches that end wherever two pictures cannot be told clearly apart (little texture, a repeating pattern) –
    a stretch has its own offset, so nothing has to add up across a gap."""
    cam = meta['camera']
    pic = meta.get('picture') or {'width': 1280}
    dense = [f for f in trace['frames'] if f['kind'] == 'dense' and f['scan'] == run['scan']
             and run['send']['t'] - 600 <= f['t'] <= (run['end_t'] or 1e12) + 300 and f['file'] in files]
    dense.sort(key=lambda f: f['t'])
    if len(dense) < 8:
        return None
    w, h = dense[0]['width'], dense[0]['height']
    ppm = cam['pxPerMm'] * w / pic['width']
    axis = run['send']['axis']
    t, pos, seg, peaks, sharp = [], [], [], [], []
    key = None          # the picture the next ones are measured against: shifts under a pixel are not measurable
    key_cum = 0.0       # where the key lies, px, along the strip
    seg_id = 0
    for f in dense:
        g = high_pass(gray_of(files[f['file']], f['codec'], w, h), 8)
        sharp.append(laplacian_variance(g))
        cum = key_cum
        if key is None:
            key = g
        else:
            dx, dy, peak = phase_shift(key, g)
            s = dx if axis == 'x' else dy
            peaks.append(peak)
            # a shift of more than a few pixels from the key is no step of one picture: a lobe of a repeating pattern
            if peak >= 0.3 and abs(s) < 8:
                cum = key_cum + s
                if abs(s) > 5:
                    key, key_cum = g, cum
            else:
                # no clear answer: a new stretch begins here, with an offset of its own
                seg_id += 1
                key, key_cum, cum = g, 0.0, 0.0
        t.append(f['t'])
        pos.append(cum / ppm)
        seg.append(seg_id)
    return {'t': np.array(t), 'pos': np.array(pos), 'seg': np.array(seg), 'peaks': np.array(peaks),
            'sharp': np.array(sharp), 'ppm': ppm}


def fit_lag(trace, run, followed):
    """The lag L (ms) and scale b that make the reports, delayed by L, fit the pictures:
    along_pic(t) = b·report(t − L) + c_stretch  – one L and b for the run, an offset for every stretch."""
    axis = run['send']['axis']
    idx = 0 if axis == 'x' else 1
    rep = [r for r in trace['reports'] if run['send']['t'] - 800 <= r['t'] <= (run['end_t'] or 1e12) + 800]
    if len(rep) < 5:
        return None
    rt = np.array([r['t'] for r in rep], dtype=float)
    rp = np.array([r['mpos'][idx] for r in rep], dtype=float)
    t, p, seg = followed['t'], followed['pos'], followed['seg']
    # stretches of at least 6 pictures that move
    keep = np.zeros(len(t), dtype=bool)
    for sid in np.unique(seg):
        m = seg == sid
        if m.sum() >= 6 and np.ptp(p[m]) > 1.0:
            keep |= m
    if keep.sum() < 8:
        return {'usable_pictures': int(keep.sum()), 'note': 'too few pictures could be followed (little texture)'}
    best = None
    for sign in (1.0, -1.0):
        for lag in np.arange(-100, 1000, 5.0):
            num = den = 0.0
            parts = []
            for sid in np.unique(seg[keep]):
                m = keep & (seg == sid) & (t - lag >= rt[0]) & (t - lag <= rt[-1])
                if m.sum() < 4:
                    continue
                model = np.interp(t[m] - lag, rt, rp)
                pm, mm = sign * p[m], model
                pm = pm - pm.mean()
                mm = mm - mm.mean()
                num += float((pm * mm).sum())
                den += float((mm * mm).sum())
                parts.append((pm, mm))
            if den <= 0 or not parts:
                continue
            b = num / den
            if b <= 0:
                continue
            res = np.concatenate([pm - b * mm for pm, mm in parts])
            rms = float(np.sqrt(np.mean(res ** 2)))
            n = int(sum(len(pm) for pm, _ in parts))
            if best is None or rms < best['rms_mm']:
                best = {'lag_ms': float(lag), 'scale': float(b), 'rms_mm': rms, 'sign': sign, 'n': n}
    return best


def lag_fit(t, along, rt, rp, lo=-100.0, hi=1000.0, step=2.0):
    """The lag (ms) that makes the reports (times `rt`, positions `rp`), delayed by it, fit the placed pictures
    (times `t`, positions `along`) best – and what is left: the rms of the pictures about that line, mm."""
    best = None
    for lag in np.arange(lo, hi, step):
        mask = (t - lag >= rt[0]) & (t - lag <= rt[-1])
        if mask.sum() < 4:
            continue
        model = np.interp(t - lag, rt, rp)
        rms = float(np.sqrt(np.mean((along[mask] - model[mask]) ** 2)))
        if best is None or rms < best['rms_mm']:
            best = {'lag_ms': float(lag), 'rms_mm': rms, 'n': int(mask.sum())}
    return best


def run_reports(trace, run):
    """The reports of a run's window (a little before and after), in the order they came."""
    return [r for r in trace['reports'] if run['send']['t'] - 800 <= r['t'] <= (run['end_t'] or 1e12) + 800]


def lag_from_solved(trace, run):
    """The lag from what the app itself placed: the registered position of each picture against the reports – on the
    page's clock (when the page saw the report, and the picture)."""
    sol = run['solved']
    if not sol:
        return None
    idx = 0 if sol['axis'] == 'x' else 1
    rep = run_reports(trace, run)
    if len(rep) < 5:
        return None
    rt = np.array([r['t'] for r in rep], dtype=float)
    rp = np.array([r['mpos'][idx] for r in rep], dtype=float)
    off = trace['meta']['camera']['offsetX' if idx == 0 else 'offsetY']
    rp = rp + off  # the crosshair
    times = {f['file']: f['t'] for f in trace['frames']}
    pts = [(times[fr['file']], a) for fr, a in zip(sol['frames'], sol['along']) if a is not None and fr['file'] in times]
    if len(pts) < 4:
        return None
    t = np.array([p[0] for p in pts])
    along = np.array([p[1] for p in pts])
    return lag_fit(t, along, rt, rp)


def lag_from_solved_pi(trace, run):
    """The same on the Pi's clock: each picture at the stamp the Pi's camera server gave it, the reports at the stamp the
    relay gave them (the same clock – `mono` or `wall` – the pictures are in). None for a run on the browser's clock, and
    for a file that has no stamps."""
    sol = run['solved']
    if not sol or sol.get('clock') != 'pi':
        return None
    idx = 0 if sol['axis'] == 'x' else 1
    pts = [(fr['stamp']['t'] * 1000.0, fr['stamp']['domain'], a) for fr, a in zip(sol['frames'], sol['along'])
           if a is not None and fr.get('stamp')]
    if len(pts) < 4:
        return None
    domain = pts[0][1]
    rep = sorted(((r['stamp'][domain], r['mpos'][idx]) for r in run_reports(trace, run) if r.get('stamp')))
    if len(rep) < 5:
        return None
    off = trace['meta']['camera']['offsetX' if idx == 0 else 'offsetY']
    rt = np.array([x[0] for x in rep], dtype=float)
    rp = np.array([x[1] for x in rep], dtype=float) + off
    # the Pi's clocks count from its start (mono) or from 1970 (wall): a lag is a difference, so the numbers are made small
    # first – a double holds 1.7e12 ms to a fraction of a microsecond, which is enough, but a fit across it is easier to read
    base = rt[0]
    t = np.array([p[0] for p in pts]) - base
    return lag_fit(t, np.array([p[2] for p in pts]), rt - base, rp, lo=-300.0)


def blur_table(trace, run, followed, lag):
    """Sharpness (variance of the Laplacian relative to the slowest pictures) by speed, mm/s – speed from the reports."""
    sol = run['solved']
    idx = 0 if run['send']['axis'] == 'x' else 1
    rep = [r for r in trace['reports'] if run['send']['t'] - 800 <= r['t'] <= (run['end_t'] or 1e12) + 800]
    if len(rep) < 5:
        return None
    rt = np.array([r['t'] for r in rep], dtype=float)
    rp = np.array([r['mpos'][idx] for r in rep], dtype=float)
    speed_rep = np.abs(np.gradient(rp, rt / 1000.0))
    t, s = followed['t'], followed['sharp']
    speed = np.interp(t - (lag or 0), rt, speed_rep)
    ref = float(np.median(s[speed < 3])) if np.any(speed < 3) else float(np.median(s))
    rows = []
    for lo, hi in ((0, 3), (3, 15), (15, 30), (30, 50), (50, 80), (80, 400)):
        m = (speed >= lo) & (speed < hi)
        if m.sum() >= 3:
            rows.append({'speed': f'{lo}-{hi}', 'n': int(m.sum()), 'sharpness': round(float(np.median(s[m]) / ref), 2)})
    return rows


def run_summary(run):
    sol = run['solved']
    if not sol:
        return None
    along = sol['along']
    placed = sum(1 for v in along if v is not None)
    fw = sum(1 for v in sol['forward'] if v is not None)
    bw = sum(1 for v in sol['backward'] if v is not None)
    return {'offered': len(along), 'placed': placed, 'forward': fw, 'backward': bw,
            'disagreement_mm': round(sol['disagreement'], 2), 'lag_used_ms': round(sol['lag'] * 1000),
            'lag_known': sol['lagKnown'], 'clock': sol.get('clock', 'browser')}


def placement_errors(trace, files, meta, runs_):
    """Each placed picture of a run against the pictures at rest that overlap it, mm (ex, ey)."""
    cam = meta['camera']
    off = (cam['offsetX'], cam['offsetY'])
    vis = meta['visibleMm']
    pic = meta.get('picture') or {'width': 1280}
    byfile = {f['file']: f for f in trace['frames']}
    rest = [f for f in trace['frames'] if f['kind'] in ('rest', 'anchor') and f.get('spindle')]
    gray_cache = {}

    def gray(f):
        if f['file'] not in gray_cache:
            gray_cache[f['file']] = high_pass(gray_of(files[f['file']], f['codec'], f['width'], f['height']), 10)
        return gray_cache[f['file']]

    out = []
    for run in runs_:
        sol = run['solved']
        if not sol:
            continue
        axis = sol['axis']
        for i, fr in enumerate(sol['frames']):
            along = sol['along'][i]
            f = byfile.get(fr['file'])
            if along is None or f is None or f['file'] not in files:
                continue
            across = sol['across']
            cross = (along, across) if axis == 'x' else (across, along)
            for r in rest:
                if r['file'] not in files:
                    continue
                rc = (r['spindle']['x'] + off[0], r['spindle']['y'] + off[1])
                if math.hypot(cross[0] - rc[0], cross[1] - rc[1]) > 0.3 * min(vis['width'], vis['height']) * 2:
                    continue
                # the grid: what both show, around the middle of the two
                mid = ((cross[0] + rc[0]) / 2, (cross[1] + rc[1]) / 2)
                g = 0.25
                half = 0.3 * min(vis['width'], vis['height'])
                nx = ny = int(2 * half / g)
                grid = (mid[0] - half, mid[1] - half, nx, ny, g)
                a = resample_to_grid(gray(f), cross, cam, f['k'] if f['k'] else 1.0, grid)
                b = resample_to_grid(gray(r), rc, cam, r['k'] if r['k'] else 1.0, grid)
                valid = ~np.isnan(a) & ~np.isnan(b)
                if valid.mean() < 0.5:
                    continue
                a = np.where(valid, a, 0)
                b = np.where(valid, b, 0)
                dx, dy, peak = phase_shift(b, a)
                if peak < 0.08:
                    continue
                # the image is y down, the machine y up
                out.append({'t': fr['t'], 'strip_axis': axis, 'ex_mm': dx * g, 'ey_mm': -dy * g, 'peak': peak})
                break
    return out


def clocks(trace):
    """What the file says of the two clocks: which the scans ran on, and – where the reports and the pictures carry the Pi's
    stamp – how unevenly the page saw them against how evenly the Pi stamped them."""
    out = {'meta_clock': trace['meta'].get('clock'),
           'scan_clocks': [s.get('options', {}).get('clock') for s in trace['scans']]}
    stamped = [r for r in trace['reports'] if r.get('stamp')]
    if len(stamped) >= 5:
        domain = 'mono'
        page = np.array([r['t'] for r in stamped], dtype=float)
        pi = np.array([r['stamp'][domain] for r in stamped], dtype=float)
        # what the page saw minus what the Pi stamped: a constant (the link and the clocks' offset) and its scatter –
        # the scatter is the link's jitter, which the Pi's stamp does not contain
        out['reports'] = {'n_stamped': len(stamped), 'page_minus_pi_ms': stats(page - pi),
                          'page_minus_pi_sd_ms': round(float(np.std(page - pi)), 2),
                          'interval_ms_page': stats(np.diff(page)), 'interval_ms_pi': stats(np.diff(pi))}
    pics = trace.get('pictures') or []
    if len(pics) >= 5:
        # per scan: the pictures are not all one stream (a scan ends, the next begins)
        groups = {}
        for p in pics:
            groups.setdefault((p['scan'], p['stamp']['domain']), []).append(p)
        rows = []
        for (scan, domain), ps in groups.items():
            if len(ps) < 5:
                continue
            page = np.array([p['t'] for p in ps], dtype=float)
            pi = np.array([p['stamp']['t'] * 1000.0 for p in ps], dtype=float)
            rows.append({'scan': scan, 'domain': domain, 'n': len(ps), 'page_minus_pi_sd_ms': round(float(np.std(page - pi)), 2),
                         'interval_ms_page': stats(np.diff(page)), 'interval_ms_pi': stats(np.diff(pi)),
                         'source': ps[0]['stamp']['source']})
        out['pictures'] = rows
    return out


def summary(report):
    """What matters, in a few lines."""
    lines = ['=== Summary ===']
    t = report['timing']
    lines.append(f"Status reports: {t['reports']['interval_ms']} (ms between reports)")
    for scan, v in t['picture_stamps'].items():
        lines.append(f"Camera pictures, scan {scan}: about {v['fps']} per second ({v['interval_ms']})")
    lines.append(f"Stalls of the page over 30 ms: {t['screen_stalls']['n']} (longest {t['screen_stalls']['longest_ms']} ms)")
    if t['jog'].get('send_to_first_Jog_report_ms'):
        lines.append(f"Jog start to the first 'Jog' report: {t['jog']['send_to_first_Jog_report_ms']} ms")
    c = report.get('clocks') or {}
    if c.get('meta_clock'):
        lines.append(f"Clock the scans ran on: {c['meta_clock']} ('pi': reports and pictures stamped by the Pi; "
                     f"'browser': stamped when this page saw them)")
    lags = [r['lag_from_placed_pictures'] for r in report['runs'] if r.get('lag_from_placed_pictures')]
    pi_lags = [r['lag_from_placed_pictures_pi'] for r in report['runs'] if r.get('lag_from_placed_pictures_pi')]
    if lags:
        lag = float(np.median([x['lag_ms'] for x in lags]))
        noise = float(np.median([x.get('timing_noise_ms', 0) for x in lags]))
        lines.append(f"Lag of the camera pictures behind the status reports, browser clock: {lag:.0f} ms (timing noise about "
                     f"{noise:.0f} ms) – from {len(lags)} run(s); the app's own figure is in meta.stripLagS")
    if pi_lags:
        lag = float(np.median([x['lag_ms'] for x in pi_lags]))
        noise = float(np.median([x.get('timing_noise_ms', 0) for x in pi_lags]))
        lines.append(f"Lag of the camera pictures behind the status reports, Pi clock: {lag:.0f} ms (timing noise about "
                     f"{noise:.0f} ms) – from {len(pi_lags)} run(s)")
        # the same placed pictures against both clocks: the lower scatter is the clock that tells the time better
        both = [(r['lag_from_placed_pictures'], r['lag_from_placed_pictures_pi']) for r in report['runs']
                if r.get('lag_from_placed_pictures') and r.get('lag_from_placed_pictures_pi')]
        if both:
            nb = float(np.median([b.get('timing_noise_ms', 0) for b, _ in both]))
            npi = float(np.median([p.get('timing_noise_ms', 0) for _, p in both]))
            winner = 'the Pi clock' if npi < nb else ('the browser clock' if nb < npi else 'neither')
            # the registration places a picture to about 0.1 mm: over the speed of the run that is the least a noise can show
            speed = float(np.median([r['speed_mm_s'] for r in report['runs'] if r.get('lag_from_placed_pictures_pi')]))
            floor = 100.0 / speed if speed > 0 else 0.0
            lines.append(f"Timing noise, browser clock {nb:.0f} ms against Pi clock {npi:.0f} ms: {winner} has the lower noise "
                         f"(the same placed pictures, {len(both)} run(s); the registration itself resolves about 0.1 mm, "
                         f"which at {speed:.0f} mm/s is {floor:.1f} ms – a figure near that says 'no more than this', not 'exactly this')")
    elif c.get('meta_clock') == 'pi':
        lines.append('A run on the Pi clock, but no run placed enough pictures to work the Pi clock\'s lag out')
    if c.get('reports'):
        r = c['reports']
        lines.append(f"Reports: the page saw them {r['page_minus_pi_sd_ms']} ms (sd) unevenly against the Pi's stamp "
                     f"({r['n_stamped']} stamped)")
    for row in c.get('pictures') or []:
        lines.append(f"Pictures, scan {row['scan']} ({row['source']}): the page saw them {row['page_minus_pi_sd_ms']} ms (sd) unevenly "
                     f"against the Pi's stamp ({row['n']} pictures)")
    ok = [r for r in report['runs'] if r.get('summary')]
    if ok:
        offered = sum(r['summary']['offered'] for r in ok)
        placed = sum(r['summary']['placed'] for r in ok)
        lines.append(f"Pictures of the runs the app could place: {placed} of {offered}")
    p = report.get('placement_vs_rest')
    if p:
        lines.append(f"Placement of those pictures against the pictures at rest: mean {p['mean_mm']} mm, worst {p['max_mm']} mm "
                     f"(n={p['n']})")
    else:
        lines.append('Placement against pictures at rest: no overlap found (record a scan by stops over the same area first)')
    # Sharpness depends on what the pictures show, so a single run proves nothing: look at the same area at two speeds.
    for r in report['runs']:
        rows = r.get('blur') or []
        if len(rows) >= 2:
            lines.append(f"Sharpness by speed ({r['speed_mm_s']} mm/s run, relative to its slowest pictures; depends on the "
                         f"content – compare runs over the same area): "
                         + ', '.join(f"{x['speed']} mm/s: {int(x['sharpness'] * 100)} %" for x in rows))
    return '\n'.join(lines) + '\n'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('trace')
    ap.add_argument('--json')
    args = ap.parse_args()
    trace, files = load(args.trace)
    meta = trace['meta']
    report = {'created': trace['createdAt'], 'scans': [{'n': s['n'], 'mode': s['mode']} for s in trace['scans']],
              'frames': {k: sum(1 for f in trace['frames'] if f['kind'] == k) for k in ('rest', 'anchor', 'run', 'dense')},
              'dropped': trace['dropped']}
    report['timing'] = timing(trace)
    report['clocks'] = clocks(trace)
    runs_ = runs(trace)
    report['runs'] = []
    for run in runs_:
        entry = {'scan': run['scan'], 'speed_mm_s': round(run['send']['feed'] / 60, 1),
                 'summary': run_summary(run)}
        followed = follow_run(trace, files, run, meta)
        if followed is not None:
            entry['dense_pictures'] = len(followed['t'])
            entry['registration_peak_median'] = round(float(np.median(followed['peaks'])), 2) if len(followed['peaks']) else None
            fit = fit_lag(trace, run, followed)
            # With an offset per stretch a steady speed hides any lag: only the scale of the positions and the
            # noise of the pictures against the reports are meaningful here, not the lag the fit lands on.
            if fit and 'scale' in fit:
                entry['dense_series'] = {'speed_scale': round(fit['scale'], 3), 'noise_mm_rms': round(fit['rms_mm'], 2),
                                         'pictures_followed': fit['n']}
            else:
                entry['dense_series'] = fit
            entry['blur'] = blur_table(trace, run, followed, (lag_from_solved(trace, run) or {}).get('lag_ms'))
        placed = lag_from_solved(trace, run)
        if placed:
            placed['timing_noise_ms'] = round(placed['rms_mm'] / (run['send']['feed'] / 60) * 1000)
        entry['lag_from_placed_pictures'] = placed
        # on the Pi's clock too, where the run was on it (the same placed pictures, the stamps instead of the page's times)
        on_pi = lag_from_solved_pi(trace, run)
        if on_pi:
            on_pi['timing_noise_ms'] = round(on_pi['rms_mm'] / (run['send']['feed'] / 60) * 1000)
        entry['lag_from_placed_pictures_pi'] = on_pi
        report['runs'].append(entry)
    errs = placement_errors(trace, files, meta, runs_)
    if errs:
        e = np.array([math.hypot(x['ex_mm'], x['ey_mm']) for x in errs])
        along = np.array([x['ex_mm'] if x['strip_axis'] == 'x' else x['ey_mm'] for x in errs])
        report['placement_vs_rest'] = {'n': len(errs), 'mean_mm': round(float(e.mean()), 2), 'max_mm': round(float(e.max()), 2),
                                       'along_strip_mean_mm': round(float(along.mean()), 2),
                                       'along_strip_sd_mm': round(float(along.std()), 2)}
    print(summary(report))
    print(json.dumps(report, indent=2, default=lambda o: o.item() if hasattr(o, 'item') else str(o)))
    if args.json:
        with open(args.json, 'w') as fh:
            json.dump(report, fh, indent=2, default=lambda o: o.item() if hasattr(o, 'item') else str(o))


if __name__ == '__main__':
    main()
