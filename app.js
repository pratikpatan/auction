(async function () {
  "use strict";

  const GROUP_RULES = {
    A: { base: 20000, step: 2000, label: "Elite", color: "#e8b923" },
    B: { base: 10000, step: 1000, label: "Core", color: "#3b82f6" },
    C: { base: 5000, step: 500, label: "Value", color: "#22c55e" },
  };

  const TEAM_BUDGET = 100000;
  const SQUAD_MAX = 7;
  const SEASON_LABELS = ["Season 1", "Season 2"];
  const AUTH_SESSION_KEY = "sun-divine-auth-session-v1";
  const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

  /**
   * Demo: set active: false to block login and existing sessions.
   * Passwords are plain for demo only — use a real backend for production.
   */
  const USERS = {
    demo: { password: "demo", active: true },
    pratik: { password: "pratik@123", active: true },
  };

  function getAuctionStorageKey() {
    const raw = (() => {
      try {
        return localStorage.getItem(AUTH_SESSION_KEY);
      } catch (_) {
        return null;
      }
    })();
    if (!raw) return "sun-divine-auction-progress-v1:anonymous";
    try {
      const s = JSON.parse(raw);
      const u = (s && s.username && String(s.username).toLowerCase()) || "anonymous";
      return `sun-divine-auction-progress-v1:${u}`;
    } catch {
      return "sun-divine-auction-progress-v1:anonymous";
    }
  }

  function getAuthSession() {
    try {
      const raw = localStorage.getItem(AUTH_SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !s.username || !s.loginAt) return null;
      return { username: String(s.username).toLowerCase(), loginAt: Number(s.loginAt) };
    } catch {
      return null;
    }
  }

  function saveAuthSession(username) {
    const u = String(username).toLowerCase();
    try {
      localStorage.setItem(
        AUTH_SESSION_KEY,
        JSON.stringify({ username: u, loginAt: Date.now() })
      );
    } catch (_) {
      /* private mode */
    }
  }

  function clearAuthSession() {
    try {
      localStorage.removeItem(AUTH_SESSION_KEY);
    } catch (_) {
      /* */
    }
  }

  function isAuthSessionFresh(session) {
    if (!session) return false;
    return Date.now() - session.loginAt < SESSION_TTL_MS;
  }

  function isAuthSessionValid() {
    const s = getAuthSession();
    if (!s || !isAuthSessionFresh(s)) return false;
    const row = USERS[s.username];
    return !!(row && row.active);
  }

  const TEAMS = [
    { id: "t1", name: "Solar Strikers", accent: "#f59e0b" },
    { id: "t2", name: "Desert Kings", accent: "#ef4444" },
    { id: "t3", name: "Monsoon XI", accent: "#3b82f6" },
    { id: "t4", name: "Valley Vipers", accent: "#8b5cf6" },
    { id: "t5", name: "Coastal Cavaliers", accent: "#14b8a6" },
    { id: "t6", name: "Fireball FC", accent: "#f43f5e" },
  ];

  const money = (n) =>
    "₹" +
    Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });

  function avatarUrl(name) {
    const q = encodeURIComponent(name || "Player");
    return `https://ui-avatars.com/api/?name=${q}&background=1e3a2f&color=f0fdf4&size=256&bold=true`;
  }

  /**
   * Extract Google Drive file id from Form/Sheets links.
   * Note: uc?export=view is often blocked for cross-site <img> (2024+); use lh3 / thumbnail instead.
   * @see https://joe-walton.com/blog/embedding-google-drive-images-in-html-in-2024/
   */
  function googleDriveFileIdFromUrl(raw) {
    if (raw == null || typeof raw !== "string") return null;
    const u = raw.trim();
    const mLh = u.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/i);
    if (mLh) return mLh[1];
    const mOpen = u.match(/drive\.google\.com\/open\?(?:[^#]*&)?id=([a-zA-Z0-9_-]+)/);
    if (mOpen) return mOpen[1];
    const mFile = u.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (mFile) return mFile[1];
    const mUc = u.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (mUc && /google\.com/i.test(u)) return mUc[1];
    return null;
  }

  /** Ordered list: first URL tends to work in <img> when file is “Anyone with the link”. */
  function driveImageCandidatesForId(fileId) {
    if (!fileId) return [];
    const id = encodeURIComponent(fileId);
    return [
      `https://lh3.googleusercontent.com/d/${id}=w1920-h1080-rw`,
      `https://lh3.googleusercontent.com/d/${id}=w1000`,
      `https://drive.google.com/thumbnail?id=${id}&sz=w1920`,
      `https://drive.google.com/thumbnail?id=${id}&sz=w1000`,
      `https://drive.google.com/uc?export=view&id=${id}`,
    ];
  }

  if (typeof window !== "undefined" && !window.__auctionDriveImgFallback) {
    window.__auctionDriveImgFallback = function (img) {
      let urls;
      try {
        urls = JSON.parse(img.getAttribute("data-auction-drive-urls") || "[]");
      } catch (_) {
        urls = [];
      }
      const fallback = img.getAttribute("data-auction-fallback") || "";
      let i = Number(img.dataset.auctionDriveIdx || 0);
      i += 1;
      img.dataset.auctionDriveIdx = String(i);
      if (i < urls.length) {
        img.src = urls[i];
        return;
      }
      img.onerror = null;
      if (fallback) img.src = fallback;
    };
  }

  function playerPhotoImgTag(p, className, widthHeightAttrs) {
    const fallback = avatarUrl(p.name);
    const wh = widthHeightAttrs || "";
    const raw = (p.photo || "").trim();

    if (!raw) {
      return `<img class="${className}" src="${escapeAttr(fallback)}" alt="${escapeAttr(p.name)}"${wh} />`;
    }

    if (/googleusercontent\.com\/d\//i.test(raw)) {
      return `<img class="${className}" src="${escapeAttr(raw)}" alt="${escapeAttr(
        p.name
      )}" onerror="this.onerror=null;this.src=${JSON.stringify(fallback)}"${wh} />`;
    }

    const fileId = googleDriveFileIdFromUrl(raw);
    if (fileId) {
      const urls = driveImageCandidatesForId(fileId);
      if (urls.length) {
        const urlsJson = escapeAttr(JSON.stringify(urls));
        return `<img class="${className}" src="${escapeAttr(urls[0])}" alt="${escapeAttr(
          p.name
        )}" data-auction-drive-urls="${urlsJson}" data-auction-fallback="${escapeAttr(
          fallback
        )}" onerror="window.__auctionDriveImgFallback&&window.__auctionDriveImgFallback(this)"${wh} />`;
      }
    }

    if (/^https?:\/\//i.test(raw)) {
      return `<img class="${className}" src="${escapeAttr(raw)}" alt="${escapeAttr(
        p.name
      )}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src=${JSON.stringify(
        fallback
      )}"${wh} />`;
    }

    return `<img class="${className}" src="${escapeAttr(fallback)}" alt="${escapeAttr(p.name)}"${wh} />`;
  }

  function statRow(label, s1, s2) {
    return `<tr><td>${label}</td><td>${s1}</td><td>${s2}</td></tr>`;
  }

  const STAT_KEYS = [
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
  ];

  /** Fallback if sample file cannot be fetched (must match data/sample-players.csv columns). */
  const SAMPLE_PLAYERS_CSV = `name,group,photo
"Dishant Thakor",A,https://lh3.googleusercontent.com/d/1AtBD5rWTNVZyBKunGzW-YExNeLyT9pmU=w1920-h1080-rw
"Vivek Nayi",B,
"New Player",C,
`;

  function normalizeGroup(g) {
    const x = String(g == null ? "C" : g)
      .trim()
      .toUpperCase();
    if (x.startsWith("A")) return "A";
    if (x.startsWith("B")) return "B";
    return "C";
  }

  function normalizeSeedPlayer(p, i) {
    return {
      ...p,
      group: normalizeGroup(p.group),
      order: i,
    };
  }

  let players = [];
  let auctionListenersBound = false;
  let authUiBound = false;

  const state = {
    soldIds: new Set(),
    removedIds: new Set(),
    currentBid: 0,
    leadingTeamId: null,
    teamPurse: Object.fromEntries(TEAMS.map((t) => [t.id, TEAM_BUDGET])),
    teamSquads: Object.fromEntries(TEAMS.map((t) => [t.id, []])),
    saleStack: [],
    roundPlayerId: null,
  };

  function resetAuctionState() {
    state.soldIds.clear();
    state.removedIds.clear();
    state.saleStack.length = 0;
    state.leadingTeamId = null;
    state.roundPlayerId = null;
    state.currentBid = 0;
    TEAMS.forEach((t) => {
      state.teamSquads[t.id] = [];
      state.teamPurse[t.id] = TEAM_BUDGET;
    });
  }

  function rosterFingerprint() {
    return players.map((p) => p.id).join("|");
  }

  function clearPersistedAuction() {
    try {
      localStorage.removeItem(getAuctionStorageKey());
    } catch (_) {
      /* private mode */
    }
  }

  function recomputePursesFromSquads() {
    TEAMS.forEach((t) => {
      const spent = state.teamSquads[t.id].reduce((sum, pl) => sum + (Number(pl.price) || 0), 0);
      state.teamPurse[t.id] = TEAM_BUDGET - spent;
    });
  }

  function persistAuctionState() {
    if (!isAuthSessionValid() || !players.length) return;
    try {
      const payload = {
        rosterFp: rosterFingerprint(),
        soldIds: [...state.soldIds],
        removedIds: [...state.removedIds],
        teamSquads: Object.fromEntries(
          TEAMS.map((t) => [t.id, state.teamSquads[t.id].map((p) => ({ ...p }))])
        ),
        saleStack: state.saleStack.map((e) => ({ ...e })),
      };
      localStorage.setItem(getAuctionStorageKey(), JSON.stringify(payload));
    } catch (_) {
      /* quota / blocked */
    }
  }

  function tryRestoreAuctionState() {
    try {
      const raw = localStorage.getItem(getAuctionStorageKey());
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || data.rosterFp !== rosterFingerprint()) return false;

      const idSet = new Set(players.map((p) => p.id));
      const rem = new Set((data.removedIds || []).filter((id) => idSet.has(id)));

      TEAMS.forEach((t) => {
        const saved = data.teamSquads && data.teamSquads[t.id];
        const list = Array.isArray(saved)
          ? saved.filter((x) => x && x.id && idSet.has(x.id) && !rem.has(x.id))
          : [];
        state.teamSquads[t.id] = list.map((x) => ({
          id: x.id,
          name: String(x.name || ""),
          group: String(x.group || "C"),
          price: Number(x.price) || 0,
        }));
      });

      state.removedIds = rem;
      state.soldIds = new Set((data.soldIds || []).filter((id) => idSet.has(id)));
      TEAMS.forEach((t) => {
        state.teamSquads[t.id].forEach((pl) => state.soldIds.add(pl.id));
      });

      recomputePursesFromSquads();

      state.saleStack = [];
      const rawStack = data.saleStack || [];
      for (const e of rawStack) {
        if (!e || !idSet.has(e.playerId)) continue;
        const sq = state.teamSquads[e.teamId];
        if (sq && sq.some((p) => p.id === e.playerId && Number(p.price) === Number(e.price))) {
          state.saleStack.push({
            teamId: e.teamId,
            playerId: e.playerId,
            price: Number(e.price),
          });
        }
      }
      const totalAssigned = TEAMS.reduce((n, te) => n + state.teamSquads[te.id].length, 0);
      if (state.saleStack.length !== totalAssigned) state.saleStack = [];

      state.leadingTeamId = null;
      state.currentBid = 0;
      state.roundPlayerId = null;
      return true;
    } catch {
      return false;
    }
  }

  function restartAuctionConfirmed() {
    if (
      !confirm(
        "Restart the entire auction? All picks, skips, team purses, removals, and undo history will be cleared. This cannot be undone."
      )
    ) {
      return;
    }
    clearPersistedAuction();
    resetAuctionState();
    resetRoundForPlayer(currentPlayer());
    render();
    showToast("Auction restarted from the first player.");
  }

  function auctionHasProgress() {
    if (state.saleStack.length > 0) return true;
    if (state.removedIds.size > 0) return true;
    for (const t of TEAMS) {
      if (state.teamSquads[t.id].length > 0) return true;
    }
    if (state.soldIds.size > 0) return true;
    return false;
  }

  function parseCSVLine(line) {
    const out = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = !inQ;
      } else if (c === "," && !inQ) {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
    out.push(cur);
    return out;
  }

  function parseCSVText(text) {
    const raw = String(text).replace(/^\uFEFF/, "");
    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trimEnd())
      .filter((l) => l.length > 0);
    if (!lines.length) throw new Error("CSV is empty.");
    const headers = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase());
    if (!headers.includes("name")) {
      throw new Error('CSV must include a "name" column.');
    }
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = parseCSVLine(lines[i]);
      const row = {};
      headers.forEach((h, j) => {
        row[h] = cells[j] != null ? String(cells[j]).trim() : "";
      });
      rows.push(row);
    }
    return rows;
  }

  function buildSeasonFromRow(row, prefix) {
    const o = {};
    let any = false;
    for (const k of STAT_KEYS) {
      const key = `${prefix}_${k}`;
      if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
        o[k] = String(row[key]).trim();
        any = true;
      }
    }
    return any ? o : null;
  }

  function playersFromCsvRows(rows) {
    const out = [];
    let auto = 0;
    const seenIds = new Set();
    for (const row of rows) {
      const name = (row.name || "").trim();
      if (!name) continue;
      let id = (row.id || "").trim();
      if (!id) id = `p${++auto}`;
      const base = id;
      let bump = 0;
      while (seenIds.has(id)) {
        bump += 1;
        id = `${base}_${bump}`;
      }
      seenIds.add(id);
      const pidRaw = (row.player_id || "").trim();
      const player_id = pidRaw ? parseInt(pidRaw, 10) : null;
      const photoRaw = (row.photo || "").trim();
      out.push({
        id,
        name,
        player_id: Number.isFinite(player_id) ? player_id : null,
        photo: photoRaw || null,
        season1: buildSeasonFromRow(row, "s1"),
        season2: buildSeasonFromRow(row, "s2"),
        group: normalizeGroup(row.group),
      });
    }
    return out.map((p, i) => ({ ...p, order: i }));
  }

  function applyImportedPlayers(nextList) {
    clearPersistedAuction();
    players = nextList.map((p, i) => ({ ...p, order: i }));
    resetAuctionState();
    resetRoundForPlayer(currentPlayer());
    setPlayerListModal(false);
    render();
  }

  function applyCsvText(text) {
    const rows = parseCSVText(text);
    const list = playersFromCsvRows(rows);
    if (!list.length) {
      showToast("No valid rows (each needs a name).");
      return;
    }
    if (auctionHasProgress()) {
      if (
        !confirm(
          "Replace the player list and reset all teams, bids, skips, and removals? This cannot be undone."
        )
      ) {
        return;
      }
    }
    applyImportedPlayers(list);
    showToast(`Loaded ${list.length} players from CSV.`);
  }

  function triggerTextDownload(text, filename) {
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadSampleCsv() {
    try {
      const res = await fetch(new URL("data/sample-players.csv", document.baseURI), {
        cache: "no-store",
      });
      if (res.ok) {
        triggerTextDownload(await res.text(), "sample-players.csv");
        return;
      }
    } catch (_) {
      /* offline or blocked */
    }
    triggerTextDownload(SAMPLE_PLAYERS_CSV.trim() + "\n", "sample-players.csv");
  }

  function isPlayerOnSquad(playerId) {
    return TEAMS.some((t) => state.teamSquads[t.id].some((x) => x.id === playerId));
  }

  function skippedUnsoldPlayers() {
    return players.filter(
      (p) =>
        state.soldIds.has(p.id) && !state.removedIds.has(p.id) && !isPlayerOnSquad(p.id)
    );
  }

  function currentPlayer() {
    const unsold = players.filter(
      (p) => !state.removedIds.has(p.id) && !state.soldIds.has(p.id)
    );
    if (!unsold.length) return null;
    return unsold[0];
  }

  function rulesFor(g) {
    return GROUP_RULES[g] || GROUP_RULES.C;
  }

  function resetRoundForPlayer(p) {
    if (!p) return;
    const r = rulesFor(p.group);
    state.currentBid = r.base;
    state.leadingTeamId = null;
    state.roundPlayerId = p.id;
  }

  function ensureRoundForCurrentPlayer() {
    const p = currentPlayer();
    if (!p) return;
    if (state.roundPlayerId !== p.id) resetRoundForPlayer(p);
  }

  function canTeamBid(teamId, newBid) {
    if (state.teamSquads[teamId].length >= SQUAD_MAX) return false;
    return state.teamPurse[teamId] >= newBid;
  }

  function placeBid(teamId) {
    const p = currentPlayer();
    if (!p) return;
    const r = rulesFor(p.group);
    let next;
    if (state.leadingTeamId == null) {
      next = r.base;
    } else {
      next = state.currentBid + r.step;
    }
    if (!canTeamBid(teamId, next)) {
      showToast("That team cannot afford this bid or squad is full.");
      return;
    }
    state.currentBid = next;
    state.leadingTeamId = teamId;
    render();
  }

  function sell() {
    const p = currentPlayer();
    if (!p) return;
    if (state.leadingTeamId == null) {
      showToast("Select a team with a bid first (use team bid buttons).");
      return;
    }
    const tid = state.leadingTeamId;
    if (state.teamSquads[tid].length >= SQUAD_MAX) {
      showToast("Squad already has 7 players.");
      return;
    }
    const price = state.currentBid;
    if (state.teamPurse[tid] < price) {
      showToast("Team does not have enough remaining purse.");
      return;
    }
    state.teamPurse[tid] -= price;
    state.teamSquads[tid].push({
      id: p.id,
      name: p.name,
      group: p.group,
      price,
    });
    state.saleStack.push({ teamId: tid, playerId: p.id, price });
    state.soldIds.add(p.id);
    state.leadingTeamId = null;
    resetRoundForPlayer(currentPlayer());
    render();
    if (!currentPlayer()) showToast("Auction complete — all players sold.");
  }

  function skipUnsold() {
    const p = currentPlayer();
    if (!p) return;
    state.soldIds.add(p.id);
    state.leadingTeamId = null;
    resetRoundForPlayer(currentPlayer());
    render();
  }

  function assignSkippedPlayerToTeam(playerId, teamId) {
    const p = players.find((x) => x.id === playerId);
    if (!p) return;
    if (
      !state.soldIds.has(playerId) ||
      isPlayerOnSquad(playerId) ||
      state.removedIds.has(playerId)
    ) {
      showToast("That player is not in the skipped list anymore.");
      return;
    }
    const r = rulesFor(p.group);
    const price = r.base;
    if (state.teamSquads[teamId].length >= SQUAD_MAX) {
      showToast("That squad already has 7 players.");
      return;
    }
    if (state.teamPurse[teamId] < price) {
      showToast("Team does not have enough purse for this player's base price.");
      return;
    }
    state.teamPurse[teamId] -= price;
    state.teamSquads[teamId].push({
      id: p.id,
      name: p.name,
      group: p.group,
      price,
    });
    state.saleStack.push({ teamId, playerId: p.id, price });
    const tn = TEAMS.find((t) => t.id === teamId)?.name || "team";
    showToast(`${p.name} → ${tn} at ${money(price)} (base).`);
    render();
  }

  function undoLastSale() {
    const x = state.saleStack.pop();
    if (!x) {
      showToast("Nothing to undo.");
      return;
    }
    const squad = state.teamSquads[x.teamId];
    const last = squad[squad.length - 1];
    if (!last || last.id !== x.playerId) {
      state.saleStack.push(x);
      showToast("Undo stack mismatch — reload page if issues persist.");
      return;
    }
    squad.pop();
    state.teamPurse[x.teamId] += x.price;
    state.soldIds.delete(x.playerId);
    resetRoundForPlayer(currentPlayer());
    render();
    showToast(`Undid sale of ${last.name}.`);
  }

  let toastTimer = null;
  function showToast(msg) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("visible"), 3200);
  }

  function phaseCounts() {
    const unsold = players.filter(
      (p) => !state.removedIds.has(p.id) && !state.soldIds.has(p.id)
    );
    const by = { A: 0, B: 0, C: 0 };
    unsold.forEach((p) => by[p.group]++);
    return by;
  }

  function renderPhaseStrip() {
    const p = currentPlayer();
    const active = p ? p.group : null;
    const counts = phaseCounts();
    return ["A", "B", "C"]
      .map((g) => {
        const r = rulesFor(g);
        const cls =
          active === g ? "phase-dot active" : counts[g] ? "phase-dot" : "phase-dot muted";
        return `<div class="${cls}" data-group="${g}">
          <span class="pg">${g}</span>
          <small>${r.label}</small>
          <small class="pc">${counts[g]} left</small>
        </div>`;
      })
      .join("");
  }

  function seasonBattingBlock(s) {
    if (!s || typeof s !== "object") return null;
    if (s.batting && typeof s.batting === "object") return s.batting;
    if (s.total_runs !== undefined || s.total_match !== undefined) return s;
    return null;
  }

  function seasonBowlingBlock(s) {
    if (!s || typeof s !== "object") return null;
    return s.bowling && typeof s.bowling === "object" ? s.bowling : null;
  }

  function seasonFieldingBlock(s) {
    if (!s || typeof s !== "object") return null;
    return s.fielding && typeof s.fielding === "object" ? s.fielding : null;
  }

  function seasonMvpBlock(s) {
    if (!s || typeof s !== "object") return null;
    return s.mvp && typeof s.mvp === "object" ? s.mvp : null;
  }

  function statCell(obj, key) {
    if (!obj || obj[key] === undefined || obj[key] === null || String(obj[key]).trim() === "") return "—";
    return String(obj[key]);
  }

  function twoColTable(rows) {
    return `
      <table class="stats-table">
        <thead><tr><th>Stat</th><th>${SEASON_LABELS[0]}</th><th>${SEASON_LABELS[1]}</th></tr></thead>
        <tbody>${rows.map(([a, b, c]) => statRow(a, b, c)).join("")}</tbody>
      </table>`;
  }

  /** Batting, bowling, fielding in meta column; MVP under photo (see renderPlayerCard). */
  function renderPlayerStatsBlocks(p) {
    const s1 = p.season1;
    const s2 = p.season2;
    const b1 = seasonBattingBlock(s1);
    const b2 = seasonBattingBlock(s2);
    const batRows = [
      ["Matches", statCell(b1, "total_match"), statCell(b2, "total_match")],
      ["Runs", statCell(b1, "total_runs"), statCell(b2, "total_runs")],
      ["Average", statCell(b1, "average"), statCell(b2, "average")],
      ["Strike rate", statCell(b1, "strike_rate"), statCell(b2, "strike_rate")],
      ["4s / 6s", `${statCell(b1, "4s")}/${statCell(b1, "6s")}`, `${statCell(b2, "4s")}/${statCell(b2, "6s")}`],
    ];
    const w1 = seasonBowlingBlock(s1);
    const w2 = seasonBowlingBlock(s2);
    const bowlRows = [
      ["Matches", statCell(w1, "total_match"), statCell(w2, "total_match")],
      ["Wickets", statCell(w1, "total_wickets"), statCell(w2, "total_wickets")],
      ["Economy", statCell(w1, "economy"), statCell(w2, "economy")],
      ["Avg", statCell(w1, "avg"), statCell(w2, "avg")],
    ];
    const f1 = seasonFieldingBlock(s1);
    const f2 = seasonFieldingBlock(s2);
    const fieldRows = [["Total dismissals", statCell(f1, "total_dismissal"), statCell(f2, "total_dismissal")]];
    const m1 = seasonMvpBlock(s1);
    const m2 = seasonMvpBlock(s2);
    const mvpRows = [
      ["Batting pts", statCell(m1, "batting"), statCell(m2, "batting")],
      ["Bowling pts", statCell(m1, "bowling"), statCell(m2, "bowling")],
      ["Fielding pts", statCell(m1, "fielding"), statCell(m2, "fielding")],
      ["Total MVP", statCell(m1, "total"), statCell(m2, "total")],
    ];
    const mainParts = [];
    if (b1 || b2) {
      mainParts.push(`<div class="stats-block"><h4 class="stats-section-title">Batting</h4>${twoColTable(batRows)}</div>`);
    }
    if (w1 || w2) {
      mainParts.push(`<div class="stats-block"><h4 class="stats-section-title">Bowling</h4>${twoColTable(bowlRows)}</div>`);
    }
    if (f1 || f2) {
      mainParts.push(`<div class="stats-block"><h4 class="stats-section-title">Fielding</h4>${twoColTable(fieldRows)}</div>`);
    }
    const belowParts = [];
    if (m1 || m2) {
      belowParts.push(`<div class="stats-block"><h4 class="stats-section-title">MVP (fantasy)</h4>${twoColTable(mvpRows)}</div>`);
    }
    let main = "";
    if (mainParts.length) {
      main = `<div class="stats-stack">${mainParts.join("")}</div>`;
    } else if (!belowParts.length) {
      main = `<p class="sub">No season stats for this player.</p>`;
    }
    const below =
      belowParts.length > 0
        ? `<div class="stats-wrap stats-wrap--below-photo"><div class="stats-stack">${belowParts.join("")}</div></div>`
        : "";
    return { main, below };
  }

  function renderPlayerCard() {
    const p = currentPlayer();
    const board = document.getElementById("player-board");
    if (!p) {
      if (players.length === 0) {
        board.innerHTML = `<div class="done-card"><h2>No players loaded</h2><p>Upload a CSV using <strong>Upload players CSV</strong>, or ensure <code>data/players.json</code> loads (serve the folder over HTTP).</p><p class="sub">Use <strong>Download sample CSV</strong> for columns: name, group, photo (optional).</p></div>`;
        return;
      }
      const left = players.filter(
        (x) => !state.removedIds.has(x.id) && !state.soldIds.has(x.id)
      ).length;
      const msg =
        left === 0
          ? "All players in the pool have been sold, skipped, or removed."
          : "No player on block.";
      board.innerHTML = `<div class="done-card"><h2>Auction closed</h2><p>${msg}</p></div>`;
      return;
    }
    const r = rulesFor(p.group);
    const stats = renderPlayerStatsBlocks(p);

    board.innerHTML = `
      <div class="player-grid">
        <div class="photo-column">
          <div class="photo-wrap">
            ${playerPhotoImgTag(p, "player-photo", "")}
            <span class="grp-badge" style="--gb:${r.color}">${p.group} · ${r.label}</span>
          </div>
          ${stats.below}
        </div>
        <div class="player-meta">
          <h2>${escapeHtml(p.name)}</h2>
          <p class="sub">Base ${money(r.base)} · Min increment ${money(r.step)}</p>
          ${stats.main ? `<div class="stats-wrap">${stats.main}</div>` : ""}
        </div>
      </div>`;
  }

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  function renderBidPanel() {
    const p = currentPlayer();
    const panel = document.getElementById("bid-panel");
    if (!p) {
      panel.innerHTML = "";
      return;
    }
    const r = rulesFor(p.group);
    const leader = TEAMS.find((t) => t.id === state.leadingTeamId);
    panel.innerHTML = `
      <div class="bid-row">
        <div class="bid-display">
          <span class="lbl">Current bid</span>
          <strong>${money(state.currentBid)}</strong>
          <span class="leader">${leader ? "Leading: " + escapeHtml(leader.name) : "Open — first bid locks base price"}</span>
        </div>
        <div class="bid-actions">
          <button type="button" id="btn-sell" class="btn primary">Sold to leading team</button>
          <button type="button" id="btn-skip" class="btn ghost">Skip / unsold</button>
        </div>
      </div>
      <p class="hint">Each click raises by ${money(r.step)} for the chosen team. Teams need purse left (max ${money(
      TEAM_BUDGET
    )} spent, ${SQUAD_MAX} players).</p>
      <div class="team-bid-grid">
        ${TEAMS.map((t) => {
          const disabled =
            state.teamSquads[t.id].length >= SQUAD_MAX ||
            !canTeamBid(t.id, state.leadingTeamId == null ? r.base : state.currentBid + r.step);
          return `<button type="button" class="team-bid" style="--ac:${t.accent}" data-team="${t.id}" ${
            disabled ? "disabled" : ""
          }>
            <span>${escapeHtml(t.name)}</span>
            <small>${money(state.teamPurse[t.id])} left · ${state.teamSquads[t.id].length}/${SQUAD_MAX}</small>
          </button>`;
        }).join("")}
      </div>`;

    document.getElementById("btn-sell").addEventListener("click", sell);
    document.getElementById("btn-skip").addEventListener("click", skipUnsold);
    panel.querySelectorAll(".team-bid").forEach((btn) => {
      btn.addEventListener("click", () => placeBid(btn.getAttribute("data-team")));
    });
  }

  function renderSkippedPanel() {
    const el = document.getElementById("skipped-panel");
    if (!el) return;
    if (players.length === 0) {
      el.innerHTML = "";
      return;
    }
    const list = skippedUnsoldPlayers();
    if (!list.length) {
      el.innerHTML =
        '<p class="skipped-empty">No skipped or unsold players. Use <strong>Skip / unsold</strong> on the block to send someone here.</p>';
      return;
    }
    el.innerHTML = list
      .map((p) => {
        const r = rulesFor(p.group);
        const price = r.base;
        const assignBtns = TEAMS.map((t) => {
          const full = state.teamSquads[t.id].length >= SQUAD_MAX;
          const poor = state.teamPurse[t.id] < price;
          const dis = full || poor;
          const why = full ? "Squad full" : poor ? "Insufficient purse" : "";
          const titleAttr = dis ? ` title="${escapeAttr(why)}"` : "";
          return `<button type="button" class="skipped-team-btn" style="--ac:${t.accent}" data-assign-skipped="${escapeAttr(
            p.id
          )}" data-assign-team="${t.id}"${dis ? " disabled" : ""}${titleAttr}>
            <span>${escapeHtml(t.name)}</span>
          </button>`;
        }).join("");
        return `<article class="skipped-card">
          <div class="skipped-main">
            ${playerPhotoImgTag(p, "skipped-photo", ' width="56" height="56"')}
            <div>
              <strong>${escapeHtml(p.name)}</strong>
              <span class="skipped-meta">${p.group} · ${r.label} · base <em>${money(price)}</em></span>
            </div>
          </div>
          <p class="skipped-hint">Add to team</p>
          <div class="skipped-team-grid">${assignBtns}</div>
        </article>`;
      })
      .join("");
  }

  function renderTeams() {
    const root = document.getElementById("teams-root");
    root.innerHTML = TEAMS.map((t) => {
      const spent = TEAM_BUDGET - state.teamPurse[t];
      const list = state.teamSquads[t.id]
        .map(
          (pl) =>
            `<li><span class="pname">${escapeHtml(pl.name)}</span><span class="pg-mini">${pl.group}</span><span class="pprice">${money(
              pl.price
            )}</span></li>`
        )
        .join("");
      return `<article class="team-card" style="--ac:${t.accent}">
        <header>
          <h3>${escapeHtml(t.name)}</h3>
          <div class="team-sum"><span>${money(state.teamPurse[t.id])}</span> remaining</div>
        </header>
        <ul class="squad">${list || '<li class="empty">No picks yet</li>'}</ul>
        <footer>${state.teamSquads[t.id].length} players · spent ${money(spent)}</footer>
      </article>`;
    }).join("");
  }

  function renderSummary() {
    const closed = state.soldIds.size;
    const removed = state.removedIds.size;
    const pending = players.filter(
      (p) => !state.removedIds.has(p.id) && !state.soldIds.has(p.id)
    ).length;
    const skippedOpen = skippedUnsoldPlayers().length;
    const el = document.getElementById("summary-bar");
    if (!el) return;
    el.innerHTML = `
      <span><strong>${closed}</strong> closed (sold + skipped) · <strong>${pending}</strong> left · <strong>${skippedOpen}</strong> skipped (unassigned) · <strong>${removed}</strong> removed</span>
      <span>Budget cap · ${money(TEAM_BUDGET)} per team · ${SQUAD_MAX} players each · Order: Group A → B → C</span>`;
  }

  function removePlayerFromPool(playerId) {
    const p = players.find((x) => x.id === playerId);
    if (!p || state.removedIds.has(playerId)) return;
    if (isPlayerOnSquad(playerId)) {
      showToast("Player is on a squad — undo the sale first, then remove.");
      return;
    }
    state.removedIds.add(playerId);
    state.soldIds.delete(playerId);
    state.leadingTeamId = null;
    resetRoundForPlayer(currentPlayer());
    showToast(`${p.name} removed from the auction pool.`);
    render();
  }

  function restorePlayerToPool(playerId) {
    if (!state.removedIds.has(playerId)) return;
    const p = players.find((x) => x.id === playerId);
    state.removedIds.delete(playerId);
    state.leadingTeamId = null;
    resetRoundForPlayer(currentPlayer());
    showToast(p ? `${p.name} restored to the pool.` : "Player restored to the pool.");
    render();
  }

  function playerListStatus(p) {
    if (state.removedIds.has(p.id)) {
      return { cls: "st-removed", label: "Removed from pool" };
    }
    const live = currentPlayer();
    if (!state.soldIds.has(p.id)) {
      if (live && live.id === p.id) return { cls: "st-live", label: "On block now" };
      return { cls: "st-pending", label: "Pending" };
    }
    for (const t of TEAMS) {
      const found = state.teamSquads[t.id].find((x) => x.id === p.id);
      if (found) {
        return { cls: "st-sold", label: `${t.name} · ${money(found.price)}` };
      }
    }
    return { cls: "st-skip", label: "Skipped / unsold" };
  }

  function renderPlayerListModalBody() {
    const body = document.getElementById("player-list-body");
    if (!body) return;
    const rows = players
      .map((p, i) => {
        const r = rulesFor(p.group);
        const st = playerListStatus(p);
        const onSquad = isPlayerOnSquad(p.id);
        let actionCell;
        if (state.removedIds.has(p.id)) {
          actionCell = `<button type="button" class="btn plist-restore" data-restore-player="${escapeAttr(
            p.id
          )}">Restore</button>`;
        } else if (onSquad) {
          actionCell = `<span class="plist-na" title="Undo sale from toolbar if needed">—</span>`;
        } else {
          actionCell = `<button type="button" class="btn plist-remove" data-remove-player="${escapeAttr(
            p.id
          )}">Remove</button>`;
        }
        const mv1 = statCell(seasonMvpBlock(p.season1), "total");
        const mv2 = statCell(seasonMvpBlock(p.season2), "total");
        return `<tr class="${st.cls}">
          <td>${i + 1}</td>
          <td>${escapeHtml(p.name)}</td>
          <td><span class="plist-badge" style="--gb:${r.color}">${p.group} · ${r.label}</span></td>
          <td class="plist-mvp">${escapeHtml(mv1)}</td>
          <td class="plist-mvp">${escapeHtml(mv2)}</td>
          <td class="plist-purse">${money(r.base)} · +${money(r.step)}</td>
          <td>${escapeHtml(st.label)}</td>
          <td class="plist-actions">${actionCell}</td>
        </tr>`;
      })
      .join("");
    const active = players.length - state.removedIds.size;
    body.innerHTML = `<table class="player-list-table">
      <thead><tr><th>#</th><th>Player</th><th>Group</th><th>S1 MVP</th><th>S2 MVP</th><th>Base · step</th><th>Status</th><th>Pool</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <p class="plist-foot">${active} active in pool (${state.removedIds.size} removed). Row order in your CSV is the auction order. Default roster comes from <code>data/players.json</code> (rebuild with <code>build_players.py</code>).</p>`;
  }

  function setPlayerListModal(open) {
    const m = document.getElementById("player-list-modal");
    if (!m) return;
    m.classList.toggle("is-open", open);
    m.setAttribute("aria-hidden", open ? "false" : "true");
    if (open) renderPlayerListModalBody();
  }

  function render() {
    ensureRoundForCurrentPlayer();
    document.getElementById("phase-strip").innerHTML = renderPhaseStrip();
    renderPlayerCard();
    renderBidPanel();
    renderSkippedPanel();
    renderTeams();
    renderSummary();
    const modal = document.getElementById("player-list-modal");
    if (modal && modal.classList.contains("is-open")) renderPlayerListModalBody();
    persistAuctionState();
  }

  function showAuthLoginCard() {
    const login = document.getElementById("auth-login-card");
    const blocked = document.getElementById("auth-blocked-card");
    if (login) login.hidden = false;
    if (blocked) blocked.hidden = true;
    setAuthFormError("");
  }

  function showAuthBlockedCard(msg) {
    const login = document.getElementById("auth-login-card");
    const blocked = document.getElementById("auth-blocked-card");
    const msgEl = document.getElementById("auth-blocked-msg");
    if (login) login.hidden = true;
    if (blocked) blocked.hidden = false;
    if (msgEl) msgEl.textContent = msg || "Your account is inactive.";
  }

  function setAuthFormError(text) {
    const err = document.getElementById("auth-form-error");
    if (!err) return;
    if (!text) {
      err.hidden = true;
      err.textContent = "";
    } else {
      err.textContent = text;
      err.hidden = false;
    }
  }

  function bindAuthUiOnce() {
    if (authUiBound) return;
    authUiBound = true;

    document.getElementById("auth-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      setAuthFormError("");
      const u = (document.getElementById("auth-username")?.value || "").trim().toLowerCase();
      const pw = document.getElementById("auth-password")?.value || "";
      const row = USERS[u];
      if (!row || row.password !== pw) {
        setAuthFormError("Invalid username or password.");
        return;
      }
      if (!row.active) {
        showAuthBlockedCard("This account is inactive. You cannot access the auction.");
        return;
      }
      saveAuthSession(u);
      document.body.classList.remove("not-authed");
      document.body.classList.add("authed");
      await enterAuctionApp();
    });

    document.getElementById("btn-logout")?.addEventListener("click", () => {
      const ok = confirm(
        "Log out? Your saved auction progress for this account stays on this device until you clear site data."
      );
      if (!ok) return;
      clearAuthSession();
      document.body.classList.remove("authed");
      document.body.classList.add("not-authed");
      showAuthLoginCard();
      const pw = document.getElementById("auth-password");
      if (pw) pw.value = "";
    });

    document.getElementById("auth-back-to-login")?.addEventListener("click", () => {
      clearAuthSession();
      showAuthLoginCard();
    });
  }

  function bindAuctionListeners() {
    document.getElementById("auction-app")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-assign-skipped][data-assign-team]");
      if (!btn || btn.disabled) return;
      e.preventDefault();
      assignSkippedPlayerToTeam(
        btn.getAttribute("data-assign-skipped"),
        btn.getAttribute("data-assign-team")
      );
    });

    document.getElementById("btn-all-players")?.addEventListener("click", () => setPlayerListModal(true));
    document.getElementById("player-list-modal")?.addEventListener("click", (e) => {
      const rm = e.target.closest("[data-remove-player]");
      if (rm) {
        e.preventDefault();
        removePlayerFromPool(rm.getAttribute("data-remove-player"));
        return;
      }
      const rs = e.target.closest("[data-restore-player]");
      if (rs) {
        e.preventDefault();
        restorePlayerToPool(rs.getAttribute("data-restore-player"));
        return;
      }
      if (e.target.closest("[data-close-modal]")) setPlayerListModal(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      const m = document.getElementById("player-list-modal");
      if (m && m.classList.contains("is-open")) setPlayerListModal(false);
    });

    document.getElementById("btn-undo")?.addEventListener("click", undoLastSale);

    document.getElementById("btn-restart-auction")?.addEventListener("click", restartAuctionConfirmed);

    document.getElementById("btn-download-sample-csv")?.addEventListener("click", () => {
      downloadSampleCsv().then(() => showToast("Sample CSV downloaded."));
    });

    document.getElementById("csv-upload")?.addEventListener("change", (e) => {
      const input = e.target;
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          applyCsvText(String(reader.result || ""));
        } catch (err) {
          showToast(err.message || "Could not read CSV.");
        }
        input.value = "";
      };
      reader.onerror = () => {
        showToast("Could not read file.");
        input.value = "";
      };
      reader.readAsText(file, "UTF-8");
    });
  }

  async function loadRosterAndRestoreState() {
    try {
      const res = await fetch(new URL("data/players.json", document.baseURI), {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      players = (await res.json()).map(normalizeSeedPlayer);
    } catch (err) {
      const shell = document.getElementById("auction-app");
      if (shell) {
        shell.innerHTML = `<div class="done-card" style="padding:2rem;max-width:40rem;margin:0 auto"><h2>Could not load roster</h2><p>Serve this project over HTTP so the browser can read <code>data/players.json</code> (for example run <code>python3 -m http.server</code> in the Auction folder, then open the URL shown).</p><p class="sub">${escapeHtml(
          String(err.message || err)
        )}</p></div>`;
      }
      return;
    }

    const restored = tryRestoreAuctionState();
    if (!restored) {
      resetAuctionState();
    }
    resetRoundForPlayer(currentPlayer());
    render();
    if (restored) {
      showToast("Restored saved progress (picks, skips, squads).");
    }
  }

  async function enterAuctionApp() {
    if (!auctionListenersBound) {
      bindAuctionListeners();
      auctionListenersBound = true;
    }
    await loadRosterAndRestoreState();
  }

  async function bootAuth() {
    bindAuthUiOnce();

    const s = getAuthSession();
    if (s && !isAuthSessionFresh(s)) {
      clearAuthSession();
      showAuthLoginCard();
      return;
    }

    if (s && isAuthSessionFresh(s)) {
      const row = USERS[s.username];
      if (!row) {
        clearAuthSession();
        showAuthLoginCard();
        return;
      }
      if (!row.active) {
        document.body.classList.remove("authed");
        document.body.classList.add("not-authed");
        showAuthBlockedCard("Your account is inactive. You cannot access the auction.");
        return;
      }
      document.body.classList.remove("not-authed");
      document.body.classList.add("authed");
      await enterAuctionApp();
      return;
    }

    showAuthLoginCard();
  }

  await bootAuth();
})();
