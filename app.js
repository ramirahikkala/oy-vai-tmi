import { simulate, yelPayment } from "./calc.js";

const euro = new Intl.NumberFormat("fi-FI", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const plain = new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 0 });

const SCENARIOS = [
  { key: "tmi", name: "Toiminimi", color: "#9c3418" },
  { key: "hold", name: "Oy, ylijäämä yhtiöön", color: "#0f6a45" },
  { key: "drain", name: "Oy, ylijäämä itselle", color: "#1e4d8c" },
];

const METRIC_HELP = {
  exit: "Iso luku on se, mitä jää, jos myyt salkun ja nostat yhtiön varat osinkona samana vuonna. Vertailu on saman päivän rahaa.",
  afterCorp: "Iso luku on varallisuus sen jälkeen, kun realisoitumattomasta tuotosta on maksettu yhteisövero ja salkun myyntivoittovero. Oy:n osinkoveroa ei ole vielä maksettu.",
  patient: "Iso luku olettaa, että yhtiön varat nostetaan myöhemmin 8 %:n rajassa. Osingosta menee silloin noin 7,5 %, mutta raha ei ole käytössä heti.",
};

const METRIC_LABEL = {
  exit: "jos nostat kaiken kerralla",
  afterCorp: "ennen osinkoveroa",
  patient: "jos osinko pysyy huojennettuna",
};

const PRESETS = {
  consult: { profit: 70000, netNeed: 40000, years: 15, rate: 7, yelIncome: 30000, oyExtra: 1200, tmiNav: 5000, oyEquity: 5000 },
  high: { profit: 150000, netNeed: 48000, years: 20, rate: 7, yelIncome: 45000, oyExtra: 2000, tmiNav: 80000, oyEquity: 80000 },
  low: { profit: 35000, netNeed: 28000, years: 10, rate: 5, yelIncome: 20000, oyExtra: 800, tmiNav: 0, oyEquity: 0 },
};

const form = document.querySelector("#form");
const cards = document.querySelector("#cards");
const verdict = document.querySelector("#verdict");
const metricHelp = document.querySelector("#metricHelp");
const yelHint = document.querySelector("#yelHint");
const yearsOut = document.querySelector("#yearsOut");
const rateOut = document.querySelector("#rateOut");
const tooltip = document.querySelector("#tooltip");
const canvas = document.querySelector("#chart");
const tbody = document.querySelector("#years tbody");

let result = null;
let metric = "exit";
let timer = 0;

function readNumber(id) {
  const raw = document.querySelector(`#${id}`).value.replace(/\s/g, "").replace(",", ".");
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function readInput() {
  const share = document.querySelector("#tmiShare").value;
  return {
    profit: readNumber("profit"),
    profitGrowth: readNumber("profitGrowth") / 100,
    netNeed: readNumber("netNeed"),
    needGrowth: readNumber("needGrowth") / 100,
    years: readNumber("years"),
    rate: readNumber("rate") / 100,
    realize: form.querySelector("input[name=realize]:checked").value,
    municipalRate: readNumber("municipal") / 100,
    churchRate: readNumber("church") / 100,
    yelIncome: readNumber("yelIncome"),
    yelStarter: document.querySelector("#yelStarter").checked,
    oyExtra: readNumber("oyExtra"),
    tmiNav: readNumber("tmiNav"),
    oyEquity: readNumber("oyEquity"),
    personal: readNumber("personal"),
    externalSalary: readNumber("externalSalary"),
    otherCapital: readNumber("otherCapital"),
    children: readNumber("children"),
    age65: document.querySelector("#age65").checked,
    tmiShare: share === "auto" ? "auto" : Number(share),
  };
}

function money(value) {
  return euro.format(Math.round(value));
}

function pointValue(point, kind) {
  if (kind === "patient") {
    const personal = point.afterCorp - point.equity;
    return personal + point.equity * 0.925;
  }
  return point[kind];
}

function burden(summary) {
  return summary.cumTax + summary.cumCorp;
}

function renderYel(input) {
  const pay = yelPayment(input.yelIncome, { starter: false });
  const starter = yelPayment(input.yelIncome, { starter: true });
  if (pay === 0) {
    yelHint.textContent = "Alle 9 423 euron työtulolla YEL-maksua ei tule.";
    return;
  }
  yelHint.textContent = input.yelStarter
    ? `YEL-maksu ${money(starter)} neljänä ensimmäisenä vuonna, sen jälkeen ${money(pay)} vuodessa.`
    : `YEL-maksu ${money(pay)} vuodessa, 24,40 % työtulosta.`;
}

function renderCards(input) {
  const ranked = SCENARIOS.map((item) => ({
    ...item,
    value: pointValue(result.summary[item.key], metric),
  })).sort((a, b) => b.value - a.value);
  const winner = ranked[0].key;
  const gap = ranked[0].value - ranked[1].value;
  const short = SCENARIOS.some((item) => result.summary[item.key].shortfall > 50);

  verdict.textContent = short
    ? "Nettotarve ei täyty koko ajalta. Luvuissa vajaus on otettu salkusta niin pitkälle kuin sitä riittää."
    : `${ranked[0].name} jättää ${money(gap)} enemmän kuin ${ranked[1].name}.`;

  cards.innerHTML = SCENARIOS.map((item) => {
    const data = result.summary[item.key];
    const hero = pointValue(data, metric);
    const taxes = burden(data);
    const taxRate = data.profit > 0 ? Math.round((taxes / data.profit) * 1000) / 10 : 0;
    const last = result.rows.at(-1)[item.key].detail;
    const first = result.rows[0][item.key].detail;
    let mix = "";
    if (item.key !== "tmi") {
      mix = `<li><span>Palkka, 1. / viimeinen vuosi</span><b>${plain.format(Math.round(first.salary))} / ${plain.format(Math.round(last.salary))}</b></li>
        <li><span>Osinko, 1. / viimeinen vuosi</span><b>${plain.format(Math.round(first.dividend))} / ${plain.format(Math.round(last.dividend))}</b></li>`;
    } else {
      const share = Math.round(last.share * 100);
      mix = `<li><span>Pääomatulo-osuus viimeisenä vuonna</span><b>${share} %</b></li>`;
    }
    const band = data.equity * 0.08;
    const bandNote = item.key === "tmi" || band <= 150000
      ? ""
      : `<p class="warn">8 % omasta pääomasta on yli 150 000 €, joten huojennettu arvio on liian kevyt.</p>`;
    return `<article class="card${item.key === winner ? " win" : ""}" style="--accent:${item.color}">
      <p class="kicker" style="color:${item.color}">${item.name}</p>
      <p class="figure">${money(hero)}</p>
      <p class="figure-label">${METRIC_LABEL[metric]}</p>
      <ul>
        <li><span>Kerralla ulos</span><b>${money(data.exit)}</b></li>
        <li><span>Ennen osinkoveroa</span><b>${money(data.afterCorp)}</b></li>
        <li><span>Huojennettu arvio</span><b>${money(pointValue(data, "patient"))}</b></li>
        <li><span>Yhtiön varat</span><b>${money(data.company)}</b></li>
        <li><span>Oma salkku</span><b>${money(data.portfolio)}</b></li>
        <li><span>Veroja matkan varrella</span><b>${money(taxes)}</b></li>
        <li><span>Niistä yhteisöveroa</span><b>${money(data.cumCorp)}</b></li>
        <li><span>Osuus tuloksesta, ilman lopetusveroa</span><b>${plain.format(taxRate)} %</b></li>
        <li><span>YEL yhteensä</span><b>${money(data.cumYel)}</b></li>
        <li><span>Elämiseen nostettu</span><b>${money(data.cumLiving)}</b></li>
        ${mix}
      </ul>
      ${data.shortfall > 50 ? `<p class="warn">Vajaus ${money(data.shortfall)} jäi kattamatta.</p>` : ""}
      ${bandNote}
    </article>`;
  }).join("");
}

function renderTable() {
  tbody.innerHTML = result.rows.map((row) => `<tr>
    <td>${row.year}</td>
    <td>${money(pointValue(row.tmi, metric))}</td>
    <td>${money(pointValue(row.hold, metric))}</td>
    <td>${money(pointValue(row.drain, metric))}</td>
  </tr>`).join("");
}

function draw() {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 800;
  const height = 340;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const pad = { l: 72, r: 12, t: 16, b: 28 };
  const rows = result.rows;
  let max = 0;
  for (const row of rows) {
    for (const item of SCENARIOS) max = Math.max(max, pointValue(row[item.key], metric));
  }
  max = Math.max(max, 1);
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const xAt = (index) => pad.l + (rows.length === 1 ? innerW / 2 : (index / (rows.length - 1)) * innerW);
  const yAt = (value) => pad.t + innerH - (value / max) * innerH;

  ctx.strokeStyle = "#d2c6ae";
  ctx.fillStyle = "#5f584c";
  ctx.lineWidth = 1;
  ctx.font = "12px Public Sans, sans-serif";
  ctx.textAlign = "right";
  for (let tick = 0; tick <= 4; tick += 1) {
    const value = (max * tick) / 4;
    const y = yAt(value);
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(width - pad.r, y);
    ctx.stroke();
    ctx.fillText(plain.format(Math.round(value / 1000)) + " t€", pad.l - 8, y + 4);
  }
  ctx.textAlign = "center";
  const yearStep = Math.max(1, Math.round(rows.length / 6));
  rows.forEach((row, index) => {
    if (index % yearStep !== 0 && index !== rows.length - 1) return;
    ctx.fillText(String(row.year), xAt(index), height - 8);
  });

  for (const item of SCENARIOS) {
    ctx.beginPath();
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 2.4;
    rows.forEach((row, index) => {
      const x = xAt(index);
      const y = yAt(pointValue(row[item.key], metric));
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  canvas._plot = { pad, innerW, rows, xAt };
}

function onMove(event) {
  if (!result || !canvas._plot) return;
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const { pad, innerW, rows } = canvas._plot;
  if (x < pad.l || x > pad.l + innerW) {
    tooltip.hidden = true;
    return;
  }
  const ratio = rows.length === 1 ? 0 : (x - pad.l) / innerW;
  const index = Math.round(ratio * (rows.length - 1));
  const row = rows[index];
  tooltip.hidden = false;
  tooltip.innerHTML = `<strong>Vuosi ${row.year}</strong><br>` + SCENARIOS.map((item) =>
    `${item.name}: ${money(pointValue(row[item.key], metric))}`).join("<br>");
  const left = Math.min(rect.width - 200, Math.max(8, x + 12));
  tooltip.style.left = `${left}px`;
  tooltip.style.top = "12px";
}

function calculate() {
  const input = readInput();
  yearsOut.textContent = String(input.years);
  rateOut.textContent = `${String(input.rate * 100).replace(".", ",")} %`;
  renderYel(input);
  metricHelp.textContent = METRIC_HELP[metric];
  result = simulate(input);
  renderCards(input);
  renderTable();
  draw();
  const saved = { ...input, realize: input.realize, metric };
  for (const id of ["profit", "profitGrowth", "netNeed", "needGrowth", "years", "rate", "municipal", "church", "yelIncome", "oyExtra", "tmiNav", "oyEquity", "personal", "externalSalary", "otherCapital", "children", "tmiShare"]) {
    saved[id] = document.querySelector(`#${id}`).value;
  }
  saved.yelStarter = input.yelStarter;
  saved.age65 = input.age65;
  saved.metric = metric;
  try {
    localStorage.setItem("oy-tmi-v1", JSON.stringify(saved));
  } catch {
    // Yksityinen selaus voi estää tallennuksen. Laskuri toimii silti.
  }
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(calculate, 40);
}

function applyPreset(name) {
  const preset = PRESETS[name];
  for (const [key, value] of Object.entries(preset)) {
    const field = document.querySelector(`#${key}`);
    if (field) field.value = value;
  }
  for (const button of document.querySelectorAll(".presets button")) {
    button.setAttribute("aria-pressed", String(button.dataset.preset === name));
  }
  calculate();
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem("oy-tmi-v1") || "null");
    if (!saved) return;
    for (const [key, value] of Object.entries(saved)) {
      const field = document.querySelector(`#${key}`);
      if (!field || key === "metric") continue;
      if (field.type === "checkbox") field.checked = Boolean(value);
      else field.value = value;
    }
    if (saved.realize) {
      const radio = form.querySelector(`input[name=realize][value="${saved.realize}"]`);
      if (radio) radio.checked = true;
    }
    if (saved.metric) {
      metric = saved.metric;
      const radio = document.querySelector(`input[name=metric][value="${saved.metric}"]`);
      if (radio) radio.checked = true;
    }
  } catch {
    localStorage.removeItem("oy-tmi-v1");
  }
}

form.addEventListener("submit", (event) => event.preventDefault());
form.addEventListener("input", schedule);
document.querySelectorAll(".presets button").forEach((button) => {
  button.addEventListener("click", () => applyPreset(button.dataset.preset));
});
document.querySelectorAll("input[name=metric]").forEach((radio) => {
  radio.addEventListener("change", () => {
    metric = radio.value;
    if (result) {
      metricHelp.textContent = METRIC_HELP[metric];
      renderCards(readInput());
      renderTable();
      draw();
    }
  });
});
canvas.addEventListener("mousemove", onMove);
canvas.addEventListener("mouseleave", () => { tooltip.hidden = true; });
window.addEventListener("resize", () => { if (result) draw(); });

restore();
calculate();
