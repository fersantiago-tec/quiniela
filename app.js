const C = window.CONFIG;
let people = [];
let apiGames = [];

function splitCSV(line){
  const out=[]; let cur=""; let q=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c === '"') q=!q;
    else if(c === "," && !q){ out.push(cur); cur=""; }
    else cur+=c;
  }
  out.push(cur);
  return out;
}

function parseCSV(text){
  const lines=text.trim().split(/\r?\n/);
  const headers=splitCSV(lines[0]).map(x=>x.trim());
  return lines.slice(1).filter(Boolean).map(line=>{
    const vals=splitCSV(line);
    return Object.fromEntries(headers.map((h,i)=>[h,(vals[i]??"").trim()]));
  });
}

async function loadPeople(){
  const r=await fetch(C.predictionsUrl,{cache:"no-store"});
  if(!r.ok) throw new Error("No se pudo cargar pronosticos.csv");
  people=parseCSV(await r.text());
}

// Normaliza mayúsculas, minúsculas, espacios y acentos.
// Ej.: "EMPATE", "empate", "Empaté" => "empate".
function normalizeText(value){
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/\s+/g," ");
}

// Busca un valor en el objeto de la persona sin importar acentos/mayúsculas
// en el nombre de la columna. Esto evita que "España"/"Bélgica" del CSV
// (que a veces vienen con codificación distinta) no encuentren match exacto
// contra los nombres de columna definidos en config.js.
function getField(person, colName){
  if(colName in person) return person[colName];
  const target = normalizeText(colName);
  const key = Object.keys(person).find(k=>normalizeText(k)===target);
  return key ? person[key] : undefined;
}

function normalizeWinner(value, match){
  const v = normalizeText(value);
  const homeEs = normalizeText(match.homeCol);
  const awayEs = normalizeText(match.awayCol);
  const homeEn = normalizeText(match.home);
  const awayEn = normalizeText(match.away);

  if(["empate","x","draw","igual","igualados"].includes(v)) return "D";
  if(v === homeEs || v === homeEn) return "H";
  if(v === awayEs || v === awayEn) return "A";

  return "";
}

function normalizeApiGame(raw,index){
  const statusText=String(raw.time_elapsed ?? raw.status ?? "").toLowerCase();
  const finished=raw.finished===true || String(raw.finished).toLowerCase()==="true" ||
    /finished|final|ft|complete/.test(statusText);
  const live=!finished && statusText && !/notstarted|scheduled|upcoming/.test(statusText);
  const state = finished ? "FINAL" : live ? "EN VIVO" : "PRÓXIMO";

  // Solo confiamos en el marcador si el partido ya inició/terminó.
  // Antes de eso, muchas APIs devuelven 0-0 o valores no numéricos como
  // placeholder, y eso se mostraba como "0-0" o "NaN-NaN".
  let hs=null, as=null;
  if(state!=="PRÓXIMO"){
    const h=Number(raw.home_score), a=Number(raw.away_score);
    hs = raw.home_score!=null && Number.isFinite(h) ? h : null;
    as = raw.away_score!=null && Number.isFinite(a) ? a : null;
  }

  return {
    id:String(raw.id ?? raw.game_id ?? raw.number ?? index+1),
    home:String(raw.home_team_name_en ?? raw.home_team_label ?? raw.home_team?.name ?? raw.home_team ?? ""),
    away:String(raw.away_team_name_en ?? raw.away_team_label ?? raw.away_team?.name ?? raw.away_team ?? ""),
    hs, as,
    state
  };
}

async function loadGames(){
  const r=await fetch(C.matchesApi,{cache:"no-store"});
  if(!r.ok) throw new Error("No se pudieron cargar resultados");
  const data=await r.json();
  const arr=Array.isArray(data)?data:(data.games ?? data.matches ?? data.data ?? []);
  apiGames=arr.map(normalizeApiGame);
}

function findGame(cfg){
  return apiGames.find(g=>g.id===cfg.id) ||
         apiGames.find(g=>
           normalizeText(g.home)===normalizeText(cfg.home) &&
           normalizeText(g.away)===normalizeText(cfg.away)
         ) ||
         {id:cfg.id,home:cfg.home,away:cfg.away,hs:null,as:null,state:"PRÓXIMO"};
}

function realOutcome(game){
  if(game.hs===game.as) return "D";
  return game.hs>game.as ? "H" : "A";
}

function scorePrediction(person,cfg,game){
  if(game.state!=="FINAL" || game.hs===null || game.as===null){
    return {points:0, exact:false};
  }

  const ph=Number(getField(person,cfg.homeCol));
  const pa=Number(getField(person,cfg.awayCol));

  if(Number.isFinite(ph) && Number.isFinite(pa) && ph===game.hs && pa===game.as){
    return {points:3, exact:true};
  }

  const predictedWinner=normalizeWinner(getField(person,cfg.winnerCol),cfg);
  if(predictedWinner && predictedWinner===realOutcome(game)){
    return {points:1, exact:false};
  }

  return {points:0, exact:false};
}

function esc(s){
  return String(s??"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;");
}

function buildRanking(){
  return people.map(person=>{
    let pts=0, exact=0;

    C.matches.forEach(cfg=>{
      const game=findGame(cfg);
      const result=scorePrediction(person,cfg,game);
      pts+=result.points;
      if(result.exact) exact++;
    });

    return {name:person.Nombre,pts,exact};
  }).sort((a,b)=>b.pts-a.pts || b.exact-a.exact || a.name.localeCompare(b.name));
}

function renderRanking(){
  document.getElementById("ranking").innerHTML=buildRanking().map((r,i)=>{
    const pos=i===0?"🥇":i===1?"🥈":i===2?"🥉":i+1;
    return `<tr>
      <td>${pos}</td>
      <td>${esc(r.name)}</td>
      <td><b>${r.pts}</b></td>
      <td>${r.exact}</td>
    </tr>`;
  }).join("");
}

function renderMatches(){
  document.getElementById("matches").innerHTML=C.matches.map(cfg=>{
    const g=findGame(cfg);

    return `<article class="match">
      <div class="match-head">
        <span>${esc(cfg.homeCol)} vs ${esc(cfg.awayCol)}</span>
        <span>${g.state}</span>
      </div>

      <div class="scoreboard">
        <span>${esc(cfg.homeCol)}</span>
        <span class="real-score">${g.state==="PRÓXIMO" ? "–" : (g.hs ?? "–")} - ${g.state==="PRÓXIMO" ? "–" : (g.as ?? "–")}</span>
        <span>${esc(cfg.awayCol)}</span>
      </div>

      <div class="picks">
        ${people.map(p=>{
          const homeGoals=getField(p,cfg.homeCol) || "—";
          const awayGoals=getField(p,cfg.awayCol) || "—";
          const winner=getField(p,cfg.winnerCol) || "—";
          const result=scorePrediction(p,cfg,g);

          return `<div class="pick">
            <span>${esc(p.Nombre)}: ${esc(homeGoals)}-${esc(awayGoals)} · ${esc(winner)}</span>
            <span class="pts">${g.state==="FINAL" ? "+"+result.points : ""}</span>
          </div>`;
        }).join("")}
      </div>
    </article>`;
  }).join("");
}

async function refresh(){
  try{
    await Promise.all([loadPeople(),loadGames()]);
    renderRanking();
    renderMatches();
    document.getElementById("updated").textContent=
      "Actualizado: "+new Date().toLocaleTimeString("es-MX");
  }catch(e){
    console.error(e);
    document.getElementById("updated").textContent=e.message;
  }
}

document.getElementById("refresh").onclick=refresh;
refresh();
setInterval(refresh,C.refreshMs);
