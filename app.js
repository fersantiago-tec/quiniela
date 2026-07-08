const CONFIG = window.QUINIELA_CONFIG;

let predictions = [];
let matches = [];

function normalizeText(v){
  return String(v ?? "").trim();
}

function parseCSV(text){
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];
  const headers = splitCSVLine(lines[0]).map(h => h.trim());

  return lines.slice(1)
    .filter(Boolean)
    .map(line => {
      const vals = splitCSVLine(line);
      return Object.fromEntries(headers.map((h,i) => [h, vals[i] ?? ""]));
    });
}

function splitCSVLine(line){
  const out = [];
  let cur = "";
  let quote = false;

  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c === '"'){
      if(quote && line[i+1] === '"'){ cur += '"'; i++; }
      else quote = !quote;
    }else if(c === "," && !quote){
      out.push(cur);
      cur="";
    }else{
      cur+=c;
    }
  }
  out.push(cur);
  return out;
}

async function loadPredictions(){
  const res = await fetch(CONFIG.predictionsUrl, {cache:"no-store"});
  if(!res.ok) throw new Error("No se pudieron cargar los pronósticos.");
  const text = await res.text();
  predictions = parseCSV(text);
}

function adaptApiMatch(raw, index){
  // La API puede cambiar nombres de campos; este adaptador intenta las variantes comunes.
  const id = raw.id ?? raw.game_id ?? raw.match_id ?? raw.number ?? (index + 1);
  const home = raw.home_team?.name ?? raw.home_team ?? raw.team1 ?? raw.local ?? raw.home ?? "";
  const away = raw.away_team?.name ?? raw.away_team ?? raw.team2 ?? raw.visitante ?? raw.away ?? "";

  const homeScore =
    raw.home_score ?? raw.score_home ?? raw.home_goals ??
    raw.score?.home ?? raw.result?.home ?? null;

  const awayScore =
    raw.away_score ?? raw.score_away ?? raw.away_goals ??
    raw.score?.away ?? raw.result?.away ?? null;

  const statusRaw = normalizeText(
    raw.status ?? raw.match_status ?? raw.state ?? raw.phase ?? ""
  ).toLowerCase();

  const elapsed = raw.elapsed ?? raw.minute ?? raw.time_elapsed ?? "";

  let status = "SCHEDULED";
  if (/live|playing|in progress|1h|2h|halftime|half time/.test(statusRaw)) status = "LIVE";
  if (/finished|final|ft|ended|complete/.test(statusRaw)) status = "FINISHED";

  return {
    id: String(id),
    home: normalizeText(home),
    away: normalizeText(away),
    homeScore: homeScore === null || homeScore === "" ? null : Number(homeScore),
    awayScore: awayScore === null || awayScore === "" ? null : Number(awayScore),
    status,
    elapsed,
    raw
  };
}

async function loadMatches(){
  const res = await fetch(CONFIG.matchesApi, {cache:"no-store"});
  if(!res.ok) throw new Error("No se pudieron cargar los resultados en vivo.");
  const data = await res.json();
  const rawMatches = Array.isArray(data) ? data : (data.games ?? data.matches ?? data.data ?? []);
  matches = rawMatches.map(adaptApiMatch);
}

function getOutcome(a,b){
  if(a === b) return "D";
  return a > b ? "H" : "A";
}

function scorePrediction(pred, match){
  if(match.homeScore === null || match.awayScore === null) return {points:0, exact:false, hit:false};

  const ph = Number(pred.PronosticoLocal);
  const pa = Number(pred.PronosticoVisitante);
  const rh = match.homeScore;
  const ra = match.awayScore;

  if(ph === rh && pa === ra){
    return {points:CONFIG.scoring.exact, exact:true, hit:true};
  }

  const hit = getOutcome(ph,pa) === getOutcome(rh,ra);
  const pts = hit ? CONFIG.scoring.outcome : 0;

  return {points:pts, exact:false, hit};
}

function findMatchForPrediction(pred){
  const id = normalizeText(pred.PartidoID);
  let match = matches.find(m => m.id === id);

  if(!match){
    const local = normalizeText(pred.Local).toLowerCase();
    const visitante = normalizeText(pred.Visitante).toLowerCase();
    match = matches.find(m =>
      m.home.toLowerCase() === local &&
      m.away.toLowerCase() === visitante
    );
  }
  return match;
}

function calculateRanking(){
  const map = new Map();

  predictions.forEach(pred => {
    const person = normalizeText(pred.Persona);
    if(!person) return;

    if(!map.has(person)){
      map.set(person,{person, points:0, exacts:0, hits:0});
    }

    const match = findMatchForPrediction(pred);
    if(!match || match.status !== "FINISHED") return;

    const s = scorePrediction(pred,match);
    const row = map.get(person);
    row.points += s.points;
    row.exacts += s.exact ? 1 : 0;
    row.hits += s.hit ? 1 : 0;
  });

  return [...map.values()].sort((a,b) =>
    b.points-a.points ||
    b.exacts-a.exacts ||
    b.hits-a.hits ||
    a.person.localeCompare(b.person)
  );
}

function renderRanking(){
  const ranking = calculateRanking();
  const tbody = document.getElementById("rankingBody");

  if(!ranking.length){
    tbody.innerHTML = `<tr><td colspan="5" class="loading">No hay pronósticos cargados.</td></tr>`;
    return;
  }

  tbody.innerHTML = ranking.map((r,i) => {
    const medal = i===0 ? "🥇" : i===1 ? "🥈" : i===2 ? "🥉" : i+1;
    return `<tr>
      <td class="medal">${medal}</td>
      <td>${escapeHtml(r.person)}</td>
      <td><strong>${r.points}</strong></td>
      <td>${r.exacts}</td>
      <td>${r.hits}</td>
    </tr>`;
  }).join("");
}

function matchStatusText(m){
  if(m.status === "LIVE") return m.elapsed ? `EN VIVO · ${m.elapsed}'` : "EN VIVO";
  if(m.status === "FINISHED") return "FINAL";
  return "PRÓXIMAMENTE";
}

function renderMatches(){
  const container = document.getElementById("matches");
  const relevant = matches
    .filter(m => m.home && m.away)
    .sort((a,b) => {
      const order = {LIVE:0,SCHEDULED:1,FINISHED:2};
      return order[a.status]-order[b.status];
    })
    .slice(0,12);

  if(!relevant.length){
    container.innerHTML = `<div class="error">No se encontraron partidos.</div>`;
    return;
  }

  container.innerHTML = relevant.map(m => `
    <article class="match-card">
      <div class="match-status">
        <span class="${m.status==="LIVE"?"live-badge":""}">${matchStatusText(m)}</span>
        <span>#${escapeHtml(m.id)}</span>
      </div>
      <div class="team-row">
        <span>${escapeHtml(m.home)}</span>
        <span class="score">${m.homeScore ?? "–"}</span>
      </div>
      <div class="team-row">
        <span>${escapeHtml(m.away)}</span>
        <span class="score">${m.awayScore ?? "–"}</span>
      </div>
    </article>
  `).join("");
}

function renderPredictions(){
  const container = document.getElementById("predictions");
  const grouped = new Map();

  predictions.forEach(p => {
    const key = normalizeText(p.PartidoID) || `${p.Local}-${p.Visitante}`;
    if(!grouped.has(key)) grouped.set(key,[]);
    grouped.get(key).push(p);
  });

  container.innerHTML = [...grouped.entries()].map(([key,rows]) => {
    const first = rows[0];
    const match = findMatchForPrediction(first);
    const title = `${first.Local} vs ${first.Visitante}`;
    const actual = match && match.homeScore !== null ? ` · ${match.homeScore}-${match.awayScore}` : "";

    return `<article class="prediction-card">
      <div class="prediction-head">${escapeHtml(title)}${actual}</div>
      <div class="prediction-grid">
        ${rows.map(r => `
          <div class="pick">
            <span>${escapeHtml(r.Persona)}</span>
            <span>${escapeHtml(r.PronosticoLocal)} - ${escapeHtml(r.PronosticoVisitante)}</span>
          </div>
        `).join("")}
      </div>
    </article>`;
  }).join("");
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function updateTimestamp(){
  document.getElementById("lastUpdate").textContent =
    `Última actualización: ${new Date().toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}`;
}

async function refreshAll(){
  try{
    document.getElementById("refreshBtn").disabled = true;
    await Promise.all([loadPredictions(), loadMatches()]);
    renderMatches();
    renderRanking();
    renderPredictions();
    updateTimestamp();
  }catch(err){
    console.error(err);
    document.getElementById("lastUpdate").textContent = "Error al actualizar datos";
    document.getElementById("matches").innerHTML =
      `<div class="error">${escapeHtml(err.message)} Revisa config.js.</div>`;
  }finally{
    document.getElementById("refreshBtn").disabled = false;
  }
}

document.getElementById("refreshBtn").addEventListener("click", refreshAll);
refreshAll();
setInterval(refreshAll, CONFIG.refreshMs);
