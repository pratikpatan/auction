#!/usr/bin/env python3
"""Merge registration names (above 14) with season batting CSVs; output data/players.json only.

Google Sheets "Print / PDF" responses omit Drive file IDs in extractable text. To attach photos:
  • Optional: save Form responses as data/registration_export.csv (columns: name + photo URL from Sheet).
  • Or paste lh3 / Drive links into MANUAL_PHOTOS below (keys = norm(name)).
"""
import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
S1 = DATA / "season1_batting.csv"
S2 = DATA / "season2_batting.csv"
OUT = DATA / "players.json"
REGISTRATION_EXPORT = DATA / "registration_export.csv"

# Paste more rows from your live Sheet "Upload your current photo" column (full URL or open?id=).
MANUAL_PHOTOS: dict[str, str] = {
    "dishantthakor": "https://lh3.googleusercontent.com/d/1AtBD5rWTNVZyBKunGzW-YExNeLyT9pmU=w1920-h1080-rw",
}


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
    with path.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            pid = int(row["player_id"])
            out[pid] = {k: row[k] for k in row}
    return out


def row_to_stats(row: dict | None) -> dict | None:
    if not row:
        return None
    keys = [
        "total_match",
        "innings",
        "total_runs",
        "highest_run",
        "average",
        "strike_rate",
        "batting_hand",
        "4s",
        "6s",
        "50s",
        "100s",
        "team_name",
    ]
    return {k: row.get(k, "") for k in keys}


def main() -> None:
    s1 = load_csv(S1)
    s2 = load_csv(S2)
    by_name_s1: dict[str, int] = {}
    by_name_s2: dict[str, int] = {}
    for pid, r in s1.items():
        by_name_s1[norm(r["name"])] = pid
    for pid, r in s2.items():
        by_name_s2[norm(r["name"])] = pid

    export_photos = load_registration_export(REGISTRATION_EXPORT)
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

        r1 = s1.get(use_pid) if use_pid else None
        r2 = s2.get(use_pid) if use_pid else None
        runs1 = int(r1["total_runs"]) if r1 and str(r1.get("total_runs", "")).isdigit() else 0
        runs2 = int(r2["total_runs"]) if r2 and str(r2.get("total_runs", "")).isdigit() else 0
        score = runs1 + runs2

        nkey = norm(name)
        raw_photo = export_photos.get(nkey) or MANUAL_PHOTOS.get(nkey)

        players.append(
            {
                "id": f"p{i+1}",
                "name": name,
                "player_id": use_pid,
                "photo": to_embed_photo_url(raw_photo),
                "season1": row_to_stats(r1),
                "season2": row_to_stats(r2),
                "_score": score,
            }
        )

    players.sort(key=lambda p: p["_score"], reverse=True)
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
        del p["_score"]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(players, indent=2), encoding="utf-8")
    if export_photos:
        print(f"Merged {len(export_photos)} photo URL(s) from {REGISTRATION_EXPORT}")
    print(f"Wrote {len(players)} players to {OUT}")


if __name__ == "__main__":
    main()
