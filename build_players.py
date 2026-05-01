#!/usr/bin/env python3
"""Merge registration with Season 1–2 leaderboard CSVs; output data/players.json only.

Expects in data/:
  season{1,2}_batting_leaderboard.csv, _bowling_, _fielding_, _mvp_leaderboard.csv

Google Sheets "Print / PDF" responses omit Drive file IDs in extractable text. To attach photos:
  • Optional: save Form responses as data/registration_export.csv (columns: name + photo URL from Sheet).
  • Or paste lh3 / Drive links into MANUAL_PHOTOS below (keys = norm(name)).
  • Existing photos are preserved from data/players.json and (when available) git HEAD:data/players.json
    so rebuilds only refresh stats, not URLs you already had.
"""
import csv
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
S1_BAT = DATA / "season1_batting_leaderboard.csv"
S1_BOWL = DATA / "season1_bowling_leaderboard.csv"
S1_FIELD = DATA / "season1_fielding_leaderboard.csv"
S1_MVP = DATA / "season1_mvp_leaderboard.csv"
S2_BAT = DATA / "season2_batting_leaderboard.csv"
S2_BOWL = DATA / "season2_bowling_leaderboard.csv"
S2_FIELD = DATA / "season2_fielding_leaderboard.csv"
S2_MVP = DATA / "season2_mvp_leaderboard.csv"
OUT = DATA / "players.json"
REGISTRATION_EXPORT = DATA / "registration_export.csv"

# Paste more rows from your live Sheet "Upload your current photo" column (full URL or open?id=).
MANUAL_PHOTOS: dict[str, str] = {
    "dishantthakor": "https://lh3.googleusercontent.com/d/1AtBD5rWTNVZyBKunGzW-YExNeLyT9pmU=w1920-h1080-rw",
}

BAT_KEYS = [
    "total_match",
    "innings",
    "total_runs",
    "highest_run",
    "average",
    "not_out",
    "strike_rate",
    "ball_faced",
    "batting_hand",
    "4s",
    "6s",
    "50s",
    "100s",
    "team_name",
]

BOWL_KEYS = [
    "total_match",
    "innings",
    "total_wickets",
    "balls",
    "highest_wicket",
    "economy",
    "SR",
    "maidens",
    "avg",
    "runs",
    "bowling_style",
    "overs",
    "dot_balls",
]

FIELD_KEYS = [
    "total_match",
    "catches",
    "caught_behind",
    "run_outs",
    "assist_run_outs",
    "stumpings",
    "caught_and_bowl",
    "total_catches",
    "total_dismissal",
]


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def drive_file_id(url: str) -> str | None:
    if not url or not isinstance(url, str):
        return None
    u = url.strip()
    m = re.search(r"googleusercontent\.com/d/([a-zA-Z0-9_-]+)", u, re.I)
    if m:
        return m.group(1)
    m = re.search(r"drive\.google\.com/open\?[^#]*\bid=([a-zA-Z0-9_-]+)", u, re.I)
    if m:
        return m.group(1)
    m = re.search(r"drive\.google\.com/file/d/([a-zA-Z0-9_-]+)", u, re.I)
    if m:
        return m.group(1)
    m = re.search(r"[?&]id=([a-zA-Z0-9_-]+)", u)
    if m and "google.com" in u.lower():
        return m.group(1)
    return None


def to_embed_photo_url(raw: str | None) -> str | None:
    """Prefer lh3 URL for <img> (Drive uc?export=view is unreliable cross-origin)."""
    if not raw or not str(raw).strip():
        return None
    u = str(raw).strip()
    if "googleusercontent.com/d/" in u.lower():
        return u
    fid = drive_file_id(u)
    if fid:
        return f"https://lh3.googleusercontent.com/d/{fid}=w1920-h1080-rw"
    if re.match(r"^https?://", u, re.I):
        return u
    return None


def load_registration_export(path: Path) -> dict[str, str]:
    """Optional CSV from Google Sheets: Form responses download, columns name + photo."""
    if not path.is_file():
        return {}
    out: dict[str, str] = {}
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            return {}
        lower = {h.lower().strip(): h for h in reader.fieldnames if h}
        name_col = lower.get("name") or lower.get("player") or reader.fieldnames[0]
        photo_col = (
            lower.get("photo")
            or lower.get("image")
            or lower.get("url")
            or lower.get("upload your current photo")
            or lower.get("upload_your_current_photo")
        )
        if not photo_col:
            return {}
        for row in reader:
            nm = (row.get(name_col) or "").strip()
            ph = (row.get(photo_col) or "").strip()
            if nm and ph:
                out[norm(nm)] = ph
    return out


# (display_name, player_id or None) — Sun Divine-5 S3 registration, age 15-25 and 26-70
REGISTRATION: list[tuple[str, int | None]] = [
    ("Aaditya Sharma", None),
    ("Frank Patel", 2357305),
    ("Vishal Sharma", 40571251),
    ("Chauhan Meet", 33271072),
    ("Manav Chauhan", 40570926),
    ("Dishant Thakor", 31418240),
    ("Meet Kadia", 34563478),
    ("RSC", None),
    ("Vivek Nayi", 19817734),
    ("Shivam Sharma", 17018986),
    ("Harshit Audichya", 40570998),
    ("Vraj", None),
    ("Darshil Raval", 40571018),
    ("Gopal Aragade", 45237969),
    ("Mayur", 40571269),
    ("Gaurav Suthar", 9834021),
    ("Archit Singh", 27222807),
    ("Niyati Parekh", None),
    ("Adityasinh Chauhan", 16978695),
    ("Vishnu Bishnoi", 40570815),
    ("Pavan Patil", 37978440),
    ("Laxman Kumawat", 40570981),
    ("Hiren Mewada", 94120),
    ("Akesh Patel", 40571083),
    ("Nirmal Singh Negi", None),
    ("Hitesh Patel", 45237777),
    ("Smit 72", 24200907),
    ("Sanjesh Raghuwanshi", 26101732),
    ("Sujeet Kumar", 40571082),
    ("Naresh Joshi", 25800778),
    ("Pratik Patel", 483923),
    ("Jigar Raval", 40665430),
    ("Trupit", 45237588),
    ("Praharsh Shah", 5057407),
    ("Ajay Patil", 36617317),
    ("Komal Patil", None),
    ("Nepal Singh", 403657),
    ("Jaydeep Parekh", 40570928),
    ("Ritesh Kayastha", 40571243),
    ("Devesh", None),
    ("Dhruv Darji", 172420),
    ("Satbir Bishnoi", None),
    ("Kirtibhai Gajjar", 40652262),
]


def load_csv(path: Path) -> dict[int, dict]:
    out: dict[int, dict] = {}
    if not path.is_file():
        return out
    with path.open(newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            try:
                pid = int(row["player_id"])
            except (KeyError, TypeError, ValueError):
                continue
            out[pid] = {k: row[k] for k in row}
    return out


def load_mvp_by_name(path: Path) -> dict[str, dict[str, str]]:
    """MVP CSV has Player Name (no player_id); index by norm(name)."""
    out: dict[str, dict[str, str]] = {}
    if not path.is_file():
        return out
    with path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            return out
        fn = {h.lower().strip().replace(" ", "_"): h for h in reader.fieldnames if h}
        name_h = fn.get("player_name") or fn.get("name")
        if not name_h:
            return out
        for row in reader:
            nm = (row.get(name_h) or "").strip()
            if not nm:
                continue
            out[norm(nm)] = {
                "batting": str(row.get("Batting") or row.get("batting") or "").strip(),
                "bowling": str(row.get("Bowling") or row.get("bowling") or "").strip(),
                "fielding": str(row.get("Fielding") or row.get("fielding") or "").strip(),
                "total": str(row.get("Total") or row.get("total") or "").strip(),
            }
    return out


def slice_row(row: dict | None, keys: list[str]) -> dict[str, str] | None:
    if not row:
        return None
    d: dict[str, str] = {}
    for k in keys:
        if k not in row:
            continue
        d[k] = str(row[k] if row[k] is not None else "").strip()
    if not any(d.values()):
        return None
    return d


def resolve_mvp(
    lookup: dict[str, dict[str, str]],
    reg_name: str,
    bat_row: dict | None,
    other_bat: dict | None,
) -> dict[str, str] | None:
    for label in (reg_name, (bat_row or {}).get("name", ""), (other_bat or {}).get("name", "")):
        k = norm(label)
        if k and k in lookup:
            return dict(lookup[k])
    return None


def pack_season(
    bat_map: dict[int, dict],
    bowl_map: dict[int, dict],
    field_map: dict[int, dict],
    mvp_lookup: dict[str, dict[str, str]],
    pid: int | None,
    reg_name: str,
    other_bat_row: dict | None,
) -> dict | None:
    if pid is None:
        return None
    bat_r = bat_map.get(pid)
    bowl_r = bowl_map.get(pid)
    field_r = field_map.get(pid)
    mvp_r = resolve_mvp(mvp_lookup, reg_name, bat_r, other_bat_row)
    out: dict = {}
    b = slice_row(bat_r, BAT_KEYS)
    if b:
        out["batting"] = b
    bw = slice_row(bowl_r, BOWL_KEYS)
    if bw:
        out["bowling"] = bw
    fd = slice_row(field_r, FIELD_KEYS)
    if fd:
        out["fielding"] = fd
    if mvp_r and any(mvp_r.values()):
        out["mvp"] = mvp_r
    return out if out else None


def try_load_players_json_from_git_head() -> list | None:
    """Last committed players.json (useful when current file lost photos after a stats-only rebuild)."""
    try:
        cp = subprocess.run(
            ["git", "-C", str(ROOT), "show", "HEAD:data/players.json"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if cp.returncode != 0 or not (cp.stdout or "").strip():
            return None
        data = json.loads(cp.stdout)
        return data if isinstance(data, list) else None
    except (subprocess.TimeoutExpired, json.JSONDecodeError, OSError, FileNotFoundError):
        return None


def build_photo_fallback_maps() -> tuple[dict[int, str], dict[str, str], dict[str, str]]:
    """Merge photo URLs from git HEAD first, then current players.json (non-null later entries win)."""
    by_pid: dict[int, str] = {}
    by_name: dict[str, str] = {}
    by_roster_id: dict[str, str] = {}
    layers: list[list] = []
    git_list = try_load_players_json_from_git_head()
    if git_list:
        layers.append(git_list)
    if OUT.is_file():
        try:
            cur = json.loads(OUT.read_text(encoding="utf-8"))
            if isinstance(cur, list):
                layers.append(cur)
        except (json.JSONDecodeError, OSError):
            pass
    for arr in layers:
        for o in arr:
            if not isinstance(o, dict):
                continue
            ph = o.get("photo")
            if ph is None or (isinstance(ph, str) and not str(ph).strip()):
                continue
            ph = str(ph).strip()
            pid = o.get("player_id")
            if isinstance(pid, int):
                by_pid[pid] = ph
            nm = norm(str(o.get("name") or ""))
            if nm:
                by_name[nm] = ph
            rid = o.get("id")
            if rid:
                by_roster_id[str(rid)] = ph
    return by_pid, by_name, by_roster_id


def mvp_total_from_season(season: dict | None) -> float:
    if not season:
        return 0.0
    m = season.get("mvp")
    if not m:
        return 0.0
    t = m.get("total", "")
    try:
        return float(t)
    except (TypeError, ValueError):
        return 0.0


def main() -> None:
    s1b = load_csv(S1_BAT)
    s1bowl = load_csv(S1_BOWL)
    s1f = load_csv(S1_FIELD)
    s2b = load_csv(S2_BAT)
    s2bowl = load_csv(S2_BOWL)
    s2f = load_csv(S2_FIELD)
    mvp1 = load_mvp_by_name(S1_MVP)
    mvp2 = load_mvp_by_name(S2_MVP)

    by_name_s1: dict[str, int] = {}
    for pid, r in s1b.items():
        by_name_s1[norm(r["name"])] = pid
    by_name_s2: dict[str, int] = {}
    for pid, r in s2b.items():
        by_name_s2[norm(r["name"])] = pid

    export_photos = load_registration_export(REGISTRATION_EXPORT)
    photo_by_pid, photo_by_name, photo_by_roster_id = build_photo_fallback_maps()
    players: list[dict] = []
    seen_pid: set[int] = set()

    for i, (name, pid) in enumerate(REGISTRATION):
        use_pid = pid
        if use_pid is None:
            n = norm(name)
            use_pid = by_name_s1.get(n) or by_name_s2.get(n)
        if use_pid is not None and use_pid in seen_pid:
            use_pid = None
        if use_pid is not None:
            seen_pid.add(use_pid)

        r1 = s1b.get(use_pid) if use_pid else None
        r2 = s2b.get(use_pid) if use_pid else None

        season1 = pack_season(s1b, s1bowl, s1f, mvp1, use_pid, name, r2)
        season2 = pack_season(s2b, s2bowl, s2f, mvp2, use_pid, name, r1)

        mvp_score = mvp_total_from_season(season1) + mvp_total_from_season(season2)

        nkey = norm(name)
        raw_photo = export_photos.get(nkey) or MANUAL_PHOTOS.get(nkey)
        if not raw_photo and use_pid is not None:
            raw_photo = photo_by_pid.get(use_pid)
        if not raw_photo:
            raw_photo = photo_by_name.get(nkey)
        if not raw_photo:
            raw_photo = photo_by_roster_id.get(f"p{i + 1}")

        players.append(
            {
                "id": f"p{i + 1}",
                "name": name,
                "player_id": use_pid,
                "photo": to_embed_photo_url(raw_photo),
                "season1": season1,
                "season2": season2,
                "_mvp": mvp_score,
            }
        )

    players.sort(key=lambda p: (p["_mvp"], p["name"]), reverse=True)
    n = len(players)
    na = (n + 2) // 3
    nb = (n + 2) // 3
    for i, p in enumerate(players):
        if i < na:
            g = "A"
        elif i < na + nb:
            g = "B"
        else:
            g = "C"
        p["group"] = g
        del p["_mvp"]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(players, indent=2), encoding="utf-8")
    if export_photos:
        print(f"Merged {len(export_photos)} photo URL(s) from {REGISTRATION_EXPORT}")
    print(f"Wrote {len(players)} players to {OUT}")


if __name__ == "__main__":
    main()
