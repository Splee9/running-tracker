"""Derive src/training-weekly-hours.json from src/training-variability.json.

The TV export only carries rolling statistics, but they pin down the weekly
hours behind them. For each n-week window (n = 8, 12, 52):

    sum(h)   = n * mean_hours
    sum(h^2) = (n - 1) * sd^2 + n * mean_hours^2,  sd = tv * mean_hours / 100
    count(h == 0) = zero_weeks

Zero weeks are recovered exactly from the counts; the remaining weeks are fitted
(h >= MIN_H) by damped Gauss-Newton, each step a bounded linear least-squares
solve. Output reproduces every published mean to ±0.01 h and every zero-week
count exactly. The rolling windows reach back 51 weeks before the first
published week, so those lookback weeks are fitted too but not emitted.

Usage: pip install numpy scipy && python3 scripts/derive_weekly_hours.py

Deploys do not run this. Vercel downloads data/public/training-weekly-hours.json
from spencer-brain (scripts/fetch-training.mjs), where hours come straight from
the training database. Use this script only to rebuild a local fallback from
src/training-variability.json.
"""

import datetime as dt
import json
from pathlib import Path

import numpy as np
from scipy.optimize import lsq_linear

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "training-variability.json"
OUT = ROOT / "src" / "training-weekly-hours.json"

WINDOW = {"short": 8, "medium": 12, "long": 52}
LOOKBACK = max(WINDOW.values()) - 1
MIN_H = 0.05  # a logged week has at least ~3 minutes
SPORTS = ["run", "bike", "all"]

d = json.loads(SRC.read_text())
first = dt.date.fromisoformat(min(p["week_end"] for p in d["series"]["run"]["short"]))
last = dt.date.fromisoformat(d["last_complete_week_end"])
N_WEEKS = (last - first).days // 7 + 1
K = N_WEEKS + LOOKBACK


def week_index(iso: str) -> int:
    return (dt.date.fromisoformat(iso) - first).days // 7 + LOOKBACK


def windows(sport):
    """Yield (window row, n, point-or-None) for every published week and horizon."""
    for horizon, pts in d["series"][sport].items():
        n = WINDOW[horizon]
        have = {week_index(p["week_end"]): p for p in pts}
        for k in range(LOOKBACK, K):
            row = np.zeros(K)
            row[k + 1 - n : k + 1] = 1
            # A missing point means TV was undefined: the whole window is zero.
            yield row, n, have.get(k)


def zero_weeks(sport) -> np.ndarray:
    rows, target = [], []
    for row, n, p in windows(sport):
        rows.append(row)
        target.append(n if p is None else p["zero_weeks"])
    A, t = np.array(rows), np.array(target, float)
    u = lsq_linear(A, t, bounds=(0, 1)).x.round()
    err = np.abs(A @ u - t).sum()
    while err > 0:  # greedy repair of the rounded relaxation
        for j in np.argsort(-np.abs(A.T @ (A @ u - t))):
            u[j] = 1 - u[j]
            e2 = np.abs(A @ u - t).sum()
            if e2 < err:
                err = e2
                break
            u[j] = 1 - u[j]
        else:
            raise SystemExit(f"{sport}: zero-week counts are inconsistent")
    return u.astype(bool)


def fit(sport, zero) -> np.ndarray:
    L, lt, lw, Q, qt, qw = [], [], [], [], [], []
    for row, n, p in windows(sport):
        if p is None:
            continue
        m, tv = p["mean_hours"], p["tv"]
        sd = tv * m / 100
        L.append(row); lt.append(n * m); lw.append(1 / (n * 0.005))
        Q.append(row); qt.append((n - 1) * sd**2 + n * m**2)
        dsd = sd * (0.005 / max(tv, 1e-6) + 0.005 / max(m, 1e-6))
        qw.append(1 / (2 * (n - 1) * sd * dsd + 2 * n * m * 0.005 + 1e-4))
    free = ~zero
    L, Q = np.array(L)[:, free], np.array(Q)[:, free]
    lt, lw, qt, qw = map(np.array, (lt, lw, qt, qw))
    nf = int(free.sum())

    x = lsq_linear(L * lw[:, None], lt * lw, bounds=(MIN_H, np.inf)).x
    cost = lambda x: np.sum(((L @ x - lt) * lw) ** 2) + np.sum(((Q @ (x * x) - qt) * qw) ** 2)
    best, lam = cost(x), 1.0
    while lam < 1e7:
        J = Q * (2 * x)[None, :]
        A = np.vstack([L * lw[:, None], J * qw[:, None], np.sqrt(lam) * np.eye(nf)])
        b = np.concatenate([lt * lw, (J @ x - (Q @ (x * x) - qt)) * qw, np.sqrt(lam) * x])
        xn = lsq_linear(A, b, bounds=(MIN_H, np.inf), method="bvls").x
        c = cost(xn)
        if c < best:
            x, best, lam = xn, c, max(lam / 3, 1e-6)
        else:
            lam *= 5
    h = np.zeros(K)
    h[free] = x
    return h


def verify(sport, h):
    worst_mean = worst_tv_rel = 0.0
    for horizon, pts in d["series"][sport].items():
        n = WINDOW[horizon]
        for p in pts:
            k = week_index(p["week_end"])
            w = h[k + 1 - n : k + 1]
            worst_mean = max(worst_mean, abs(round(w.mean(), 2) - p["mean_hours"]))
            tv = w.std(ddof=1) / w.mean() * 100
            worst_tv_rel = max(worst_tv_rel, abs(tv - p["tv"]) / p["tv"])
            assert int((w == 0).sum()) == p["zero_weeks"], (sport, horizon, p["week_end"])
    assert worst_mean <= 0.0100001, (sport, worst_mean)
    print(f"{sport}: means within ±{worst_mean:.2f} h, TV within {worst_tv_rel:.1%}, zero weeks exact")


hours = {}
for s in SPORTS:
    h = fit(s, zero_weeks(s))
    verify(s, h)
    hours[s] = [round(float(v), 2) for v in h[LOOKBACK:]]

out = {
    "as_of": d["as_of"],
    "last_complete_week_end": d["last_complete_week_end"],
    "metric": "weekly_hours",
    "definition": "total hours per Mon–Sun week (America/Chicago), same sport filters as training_variability",
    "derivation": "fitted by scripts/derive_weekly_hours.py so the 8/12/52-week means, TVs and zero-week counts reproduce training-variability.json",
    "weeks": [(first + dt.timedelta(weeks=i)).isoformat() for i in range(N_WEEKS)],
    "hours": hours,
}
OUT.write_text(json.dumps(out, separators=(",", ":")) + "\n")
print(f"wrote {OUT.relative_to(ROOT)} ({N_WEEKS} weeks)")
