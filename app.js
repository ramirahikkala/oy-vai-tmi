import { advantageCurve, simulate } from "./calc.js";

const $ = (selector) => document.querySelector(selector);
const fmt = new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 0 });
const money = (n) => `${fmt.format(Math.round(n))} €`;
const signed = (n) => {
  const r = Math.round(n);
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${fmt.format(Math.abs(r))} €`;
};
const kilo = (n) => fmt.format(Math.round(n / 1000));
const signedKilo = (n) => {
  const r = Math.round(n / 1000);
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${fmt.format(Math.abs(r))} t€`;
};
const roundTo = (n, step) => Math.round(n / step) * step;

const CURVE_MIN = 20_000;
const CURVE_POINTS = 25;

// ---------- Syötteet ----------

function readNumber(id) {
  const raw = $(`#${id}`).value.replace(/\s/g, "").replace(",", ".");
  const n = Number(raw);
  return raw === "" || !Number.isFinite(n) ? 0 : n;
}

function readInput() {
  const postRaw = $("#postWithdrawal").value.trim();
  const tmiShare = $("#tmiShare").value;
  return {
    profit: readNumber("profit"),
    netNeed: readNumber("netNeed"),
    years: readNumber("years"),
    rate: readNumber("rate") / 100,
    profitGrowth: readNumber("profitGrowth") / 100,
    needGrowth: readNumber("needGrowth") / 100,
    yelIncome: readNumber("yelIncome"),
    yelStarter: $("#yelStarter").checked,
    municipalRate: readNumber("municipal") / 100,
    churchRate: readNumber("church") / 100,
    children: readNumber("children"),
    age65: $("#age65").checked,
    oyExtra: readNumber("oyExtra"),
    oyEquity: readNumber("oyEquity"),
    dividendShare: $("#optimalMix").checked ? "auto" : readNumber("dividendShare") / 100,
    postWithdrawal: postRaw === "" ? "auto" : readNumber("postWithdrawal"),
    retireYears: readNumber("retireYears"),
    realize: document.querySelector('input[name="realize"]:checked').value,
    personal: readNumber("personal"),
    tmiNav: readNumber("tmiNav"),
    tmiShare: tmiShare === "auto" ? "auto" : Number(tmiShare),
    externalSalary: readNumber("externalSalary"),
    otherCapital: readNumber("otherCapital"),
  };
}

// ---------- Kaavioiden apurit ----------

function niceTicks(min, max, target) {
  const span = max - min || 1;
  const rough = span / target;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => span / s <= target + 0.5) || 10 * pow;
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) ticks.push(Math.round(v));
  return ticks;
}

const linear = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
const path = (points) => points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");

function interpolate(points, x, xKey, yKey) {
  if (x <= points[0][xKey]) return points[0][yKey];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (x <= b[xKey]) return a[yKey] + ((x - a[xKey]) / (b[xKey] - a[xKey])) * (b[yKey] - a[yKey]);
  }
  return points[points.length - 1][yKey];
}

/** Kohdistin ja vihje. getInfo(xPx) palauttaa { x, top, bottom, html } tai null. */
function attachHover(el, getInfo) {
  const cross = el.querySelector(".cross");
  const tip = el.querySelector(".tip");
  const hide = () => {
    cross.hidden = true;
    tip.hidden = true;
  };
  const show = (event) => {
    const box = el.getBoundingClientRect();
    const info = getInfo(event.clientX - box.left);
    if (!info) return hide();
    cross.hidden = false;
    tip.hidden = false;
    cross.style.left = `${info.x}px`;
    cross.style.top = `${info.top}px`;
    cross.style.height = `${info.bottom - info.top}px`;
    tip.innerHTML = info.html;
    const width = tip.offsetWidth;
    const left = info.x + 10 + width > box.width ? info.x - 10 - width : info.x + 10;
    tip.style.left = `${Math.max(0, left)}px`;
    tip.style.top = `${info.top}px`;
  };
  el.addEventListener("pointermove", show);
  el.addEventListener("pointerdown", show);
  el.addEventListener("pointerleave", hide);
  el.addEventListener("pointercancel", hide);
}

// ---------- Kaavio 1: oy:n etu tuloksen mukaan ----------

let advView = null;

function findCrossings(curve) {
  const out = [];
  for (let i = 1; i < curve.length; i += 1) {
    const a = curve[i - 1];
    const b = curve[i];
    if (a.shortfall || b.shortfall) continue;
    if ((a.advantage < 0 && b.advantage >= 0) || (a.advantage >= 0 && b.advantage < 0)) {
      const t = a.advantage / (a.advantage - b.advantage);
      out.push({ profit: a.profit + t * (b.profit - a.profit), up: b.advantage >= 0 });
    }
  }
  return out;
}

function renderAdvantage(curve, current, crossings) {
  const el = $("#advChart");
  const W = Math.max(280, el.clientWidth);
  const H = W < 520 ? 210 : 300;
  const m = { l: 44, r: 14, t: 16, b: 34 };
  const xMin = curve[0].profit;
  const xMax = curve[curve.length - 1].profit;
  const values = curve.map((p) => p.advantage).concat(current.advantage, 0);
  let yMin = Math.min(...values);
  let yMax = Math.max(...values);
  const pad = (yMax - yMin || 1000) * 0.1;
  yMin -= yMin < 0 ? pad : 0;
  yMax += yMax > 0 ? pad : 0;
  if (yMax === yMin) yMax = yMin + 1000;
  const x = linear(xMin, xMax, m.l, W - m.r);
  const y = linear(yMin, yMax, H - m.b, m.t);
  const y0 = y(0);
  const pts = curve.map((p) => [x(p.profit), y(p.advantage)]);
  const line = path(pts);
  const area = `${line}L${pts[pts.length - 1][0].toFixed(1)},${y0.toFixed(1)}L${pts[0][0].toFixed(1)},${y0.toFixed(1)}Z`;

  const yTicks = niceTicks(yMin, yMax, 4);
  const xTicks = niceTicks(xMin, xMax, W < 520 ? 4 : 7).filter((t) => t >= xMin);
  const lastShort = curve.filter((p) => p.shortfall).map((p) => p.profit).pop();

  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Oy:n etu toiminimeen verrattuna eri vuosituloksilla">`;
  svg += `<defs><clipPath id="clipUp"><rect x="0" y="0" width="${W}" height="${y0}"/></clipPath>`;
  svg += `<clipPath id="clipDown"><rect x="0" y="${y0}" width="${W}" height="${H - y0}"/></clipPath></defs>`;
  for (const t of yTicks) {
    svg += `<line class="${t === 0 ? "zero" : "grid"}" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/>`;
    svg += `<text x="${m.l - 6}" y="${y(t) + 4}" text-anchor="end">${t > 0 ? "+" : t < 0 ? "−" : ""}${kilo(Math.abs(t))}</text>`;
  }
  for (const t of xTicks) {
    svg += `<text x="${x(t)}" y="${H - m.b + 15}" text-anchor="middle">${kilo(t)}</text>`;
  }
  svg += `<text x="${W - m.r}" y="${H - 3}" text-anchor="end">Tulos vuodessa, t€</text>`;
  svg += `<text x="${m.l - 6}" y="${H - 3}" text-anchor="end">t€</text>`;
  if (lastShort) {
    const w = x(lastShort) - m.l;
    svg += `<rect class="short" x="${m.l}" y="${m.t}" width="${w}" height="${H - m.b - m.t}"/>`;
  }
  svg += `<path class="area oy-fill" d="${area}" clip-path="url(#clipUp)"/>`;
  svg += `<path class="area tmi-fill" d="${area}" clip-path="url(#clipDown)"/>`;
  svg += `<path class="series oy-stroke" d="${line}" clip-path="url(#clipUp)"/>`;
  svg += `<path class="series tmi-stroke" d="${line}" clip-path="url(#clipDown)"/>`;
  if (yMax > 0 && y0 - m.t > 34) svg += `<text class="region" x="${W - m.r - 4}" y="${m.t + 12}" text-anchor="end">Oy kannattaa ↑</text>`;
  if (yMin < 0 && H - m.b - y0 > 26) svg += `<text class="region" x="${W - m.r - 4}" y="${H - m.b - 7}" text-anchor="end">Toiminimi kannattaa ↓</text>`;

  for (const c of crossings) {
    svg += `<circle class="hollow" cx="${x(c.profit)}" cy="${y0}" r="4"/>`;
  }

  const cx = x(Math.min(xMax, Math.max(xMin, current.profit)));
  const cy = y(current.advantage);
  const up = current.advantage >= 0;
  svg += `<line class="guide" x1="${cx}" x2="${cx}" y1="${m.t}" y2="${H - m.b}"/>`;
  svg += `<circle class="${up ? "oy-fill" : "tmi-fill"} ring" cx="${cx}" cy="${cy}" r="6"/>`;
  // Käyrä nousee oikealle, joten luku mahtuu pisteen vasempaan yläkulmaan
  // tai oikeaan alakulmaan osumatta viivaan.
  const above = cx > m.l + 70 && cy - 12 > m.t + 4;
  svg += `<text class="strong" x="${above ? cx - 9 : cx + 9}" y="${above ? cy - 9 : cy + 18}" text-anchor="${above ? "end" : "start"}">${signedKilo(current.advantage)}</text>`;
  svg += "</svg>";
  el.querySelector(".plot").innerHTML = svg;
  $("#advNote").hidden = !lastShort;
  advView = { curve, x, xMin, xMax, m, W, H };
}

function advantageInfo(px) {
  if (!advView) return null;
  const { curve, x, xMin, xMax, m, W, H } = advView;
  if (px < m.l - 8 || px > W - m.r + 8) return null;
  const profit = Math.min(xMax, Math.max(xMin, xMin + ((px - m.l) / (W - m.r - m.l)) * (xMax - xMin)));
  const snapped = roundTo(profit, 2500);
  const advantage = interpolate(curve, snapped, "profit", "advantage");
  const winner = advantage >= 0 ? "Oy" : "Toiminimi";
  return {
    x: x(snapped),
    top: m.t,
    bottom: H - m.b,
    html: `Tulos ${money(snapped)}<br><b>${winner} ${signed(Math.abs(advantage))}</b>`,
  };
}

// ---------- Kaavio 2: varallisuus vuosittain ----------

let yearView = null;

function yearSeries(result) {
  const W = result.input.years;
  const points = result.rows.map((r) => ({ t: r.year, label: `Työvuosi ${r.year}`, oy: r.oy.wealth, tmi: r.tmi.wealth }));
  const oyPath = result.summary.oy.retirePath;
  const tmiPath = result.summary.tmi.retirePath;
  for (let i = 0; i < oyPath.length; i += 1) {
    const last = i === oyPath.length - 1;
    points.push({
      t: W + i + 1,
      label: last ? `Eläkevuosi ${i + 1}, loput myydään` : `Eläkevuosi ${i + 1}`,
      oy: oyPath[i].wealth,
      tmi: tmiPath[i].wealth,
    });
  }
  return points;
}

function renderYears(result) {
  const el = $("#yearChart");
  const points = yearSeries(result);
  const career = result.input.years;
  const W = Math.max(280, el.clientWidth);
  const H = W < 520 ? 200 : 270;
  const m = { l: 44, r: 62, t: 22, b: 34 };
  const n = points.length;
  const x = n === 1 ? () => (m.l + W - m.r) / 2 : linear(1, n, m.l, W - m.r);
  const top = Math.max(1000, ...points.map((p) => Math.max(p.oy, p.tmi))) * 1.08;
  const y = linear(0, top, H - m.b, m.t);
  const yTicks = niceTicks(0, top, 4);
  const xTicks = niceTicks(1, Math.max(2, n), W < 520 ? 4 : 8).filter((t) => t >= 1 && t <= n);

  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Varallisuus verojen jälkeen työ- ja eläkevuosina, oy ja toiminimi">`;
  for (const t of yTicks) {
    svg += `<line class="${t === 0 ? "zero" : "grid"}" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/>`;
    svg += `<text x="${m.l - 6}" y="${y(t) + 4}" text-anchor="end">${kilo(t)}</text>`;
  }
  for (const t of xTicks) svg += `<text x="${x(t)}" y="${H - m.b + 15}" text-anchor="middle">${t}</text>`;
  svg += `<text x="${W - m.r}" y="${H - 3}" text-anchor="end">Vuosi</text>`;
  svg += `<text x="${m.l - 6}" y="${H - 3}" text-anchor="end">t€</text>`;
  if (n > career) {
    const bx = n === 1 ? x(1) : x(career + 0.5);
    svg += `<line class="guide" x1="${bx}" x2="${bx}" y1="${m.t - 8}" y2="${H - m.b}"/>`;
    const roomLeft = bx - m.l > 64;
    svg += `<text x="${bx - 5}" y="${m.t - 10}" text-anchor="end"${roomLeft ? "" : ' visibility="hidden"'}>työ</text>`;
    svg += `<text x="${bx + 5}" y="${m.t - 10}">eläke</text>`;
  }

  const last = points[n - 1];
  const ends = [];
  for (const key of ["tmi", "oy"]) {
    const pts = points.map((p) => [x(p.t), y(p[key])]);
    if (n > 1) svg += `<path class="series ${key}-stroke" d="${path(pts)}"/>`;
    const [ex, ey] = pts[n - 1];
    svg += `<circle class="${key}-fill ring" cx="${ex}" cy="${ey}" r="5"/>`;
    ends.push({ ex, ey, value: last[key] });
  }
  ends.sort((a, b) => a.ey - b.ey);
  if (ends[1].ey - ends[0].ey < 14) {
    const mid = (ends[0].ey + ends[1].ey) / 2;
    ends[0].ey = mid - 7;
    ends[1].ey = mid + 7;
  }
  for (const e of ends) svg += `<text class="strong" x="${e.ex + 9}" y="${e.ey + 4}">${kilo(e.value)} t€</text>`;
  svg += "</svg>";
  el.querySelector(".plot").innerHTML = svg;
  yearView = { points, x, m, W, H };
}

function yearInfo(px) {
  if (!yearView) return null;
  const { points, x, m, W, H } = yearView;
  if (px < m.l - 8 || px > W - m.r + 8) return null;
  const n = points.length;
  const i = n === 1 ? 0 : Math.min(n - 1, Math.max(0, Math.round(((px - m.l) / (W - m.r - m.l)) * (n - 1))));
  const p = points[i];
  return {
    x: x(p.t),
    top: m.t,
    bottom: H - m.b,
    html: `${p.label}<br><i class="dot oy"></i>Oy <b>${money(p.oy)}</b><br><i class="dot tmi"></i>Toiminimi <b>${money(p.tmi)}</b>`,
  };
}

// ---------- Tuomio, taulukko ja avattu vuosi ----------

function renderVerdict(result, curve, crossings) {
  const { tmi, oy, advantage } = result.summary;
  const input = result.input;
  const scale = Math.max(1, Math.abs(tmi.total), Math.abs(oy.total));
  const even = Math.abs(advantage) < scale * 0.005;
  const winner = even ? "even" : advantage > 0 ? "oy" : "tmi";
  $("#verdict").dataset.winner = winner;
  $("#verdictTitle").textContent = even ? "Lähes tasan" : winner === "oy" ? "Osakeyhtiö kannattaa" : "Toiminimi kannattaa";
  $("#verdictAmount").textContent = even ? "±0 €" : `+${fmt.format(roundTo(Math.abs(advantage), 1000))} €`;

  const span = `${input.years} työvuoden ja ${input.retireYears} eläkevuoden aikana`;
  let limit;
  const lo = kilo(curve[0].profit);
  const hi = kilo(curve[curve.length - 1].profit);
  const ok = curve.filter((p) => !p.shortfall);
  if (crossings.length === 1 && crossings[0].up) {
    limit = `Raja: oy kannattaa, kun tulos on yli noin ${fmt.format(roundTo(crossings[0].profit, 1000))} €/v.`;
  } else if (crossings.length === 1) {
    limit = `Raja: oy kannattaa, kun tulos on alle noin ${fmt.format(roundTo(crossings[0].profit, 1000))} €/v.`;
  } else if (crossings.length > 1) {
    limit = `Raja ylittyy useassa kohdassa: ${crossings.map((c) => `${kilo(c.profit)} t€`).join(", ")}.`;
  } else if (ok.length && ok.every((p) => p.advantage >= 0)) {
    limit = `Oy kannattaa koko välillä ${lo}–${hi} t€, kun tulos riittää elämiseen.`;
  } else if (ok.length) {
    limit = `Toiminimi kannattaa koko välillä ${lo}–${hi} t€.`;
  } else {
    limit = "";
  }
  const warns = [];
  if (tmi.shortfall > 1 || oy.shortfall > 1) warns.push("Tulos ei riitä nettotarpeeseen, joten vertailu ontuu.");
  const outOf = [tmi.retireShortYears && "toiminimeltä", oy.retireShortYears && "oy:ltä"].filter(Boolean);
  if (outOf.length) warns.push(`Eläkkeellä rahat loppuvat kesken ${outOf.join(" ja ")}.`);
  const warn = warns.map((w) => `<br><span class="warn">${w}</span>`).join("");
  $("#verdictSub").innerHTML = `${even ? "Ero on alle puoli prosenttia" : "enemmän käteen"} ${span}. ${limit}${warn}`;
}

function renderWhy(result) {
  const { tmi, oy, retireTarget } = result.summary;
  const { years, retireYears } = result.input;
  const row = (label, a, b, { total = false, note = "" } = {}) =>
    `<tr${total ? ' class="total"' : ""}><td>${label}${note ? `<small>${note}</small>` : ""}</td><td>${fmt.format(Math.round(a))}</td><td>${fmt.format(Math.round(b))}</td><td class="diff">${signed(b - a).replace(" €", "")}</td></tr>`;
  const rows = [row("Työvuosina käteen", tmi.cumLiving, oy.cumLiving, { note: `${years} v` })];
  if (retireYears > 1) rows.push(row("Eläkkeellä nostettu", tmi.retireNet, oy.retireNet, { note: `${retireYears - 1} v, uran lopun rahana` }));
  rows.push(
    row("Lopuksi myyty", tmi.leftover, oy.leftover, { note: retireYears > 1 ? `vuonna ${years + retireYears}, uran lopun rahana` : "heti uran päätyttyä" }),
    row("Käteen yhteensä", tmi.total, oy.total, { total: true }),
    row("Verot työvuosina", tmi.cumTax, oy.cumTax + oy.cumCorp, { note: `oy: yhteisövero ${money(oy.cumCorp)}` }),
    row("Verot eläkkeellä", tmi.retireTax, oy.retireTax, { note: "uran lopun rahana" }),
    row("YEL-maksut", tmi.cumYel, oy.cumYel),
    row("Oy:n kulut ja palkan sivukulut", 0, oy.cumCosts),
  );
  $("#whyBody").innerHTML = rows.join("");

  const d = oy.detail;
  const parts = [`Viimeisenä työvuonna oy maksaa palkkaa ${money(d.salary)} ja osinkoa ${money(d.dividend)}. Yhtiössä on työuran lopussa ${money(oy.company)}, toiminimen salkussa ${money(tmi.portfolio)}.`];
  if (retireYears > 1) {
    parts.push(`Eläkkeellä molemmista nostetaan ${money(retireTarget)} vuodessa verojen jälkeen: oy:stä osinkona, toiminimeltä salkkua myymällä.`);
  }
  $("#whyNote").textContent = parts.join(" ");
}

function renderYearOne(result) {
  const row = result.rows[0];
  const t = row.tmi.detail;
  const o = row.oy.detail;
  const list = (title, items) =>
    `<dl><dt class="head">${title}</dt>${items.map(([k, v]) => `<dt>${k}</dt><dd>${money(v)}</dd>`).join("")}</dl>`;
  $("#yearOne").innerHTML =
    list("Toiminimi", [
      ["Tulos", row.profit],
      ["YEL-maksu", row.yel],
      ["Yrittäjävähennys", t.deduction],
      ["Ansiotuloa", t.earned],
      ["Pääomatuloa", t.capital],
      ["Henkilövero", t.taxes.total],
      ["Käteen", t.cash],
      ["Siitä sijoitukseen", t.saved],
    ]) +
    list("Osakeyhtiö", [
      ["Tulos", row.profit],
      ["YEL-maksu", row.yel],
      ["Palkka", o.salary],
      ["Palkan sivukulu", o.side],
      ["Osinko", o.dividend],
      ["Yhteisövero", o.corp],
      ["Henkilövero", o.taxes.total],
      ["Käteen", o.net],
      ["Yhtiöön jää", row.oy.company],
    ]);
}

// ---------- Päivitys ----------

let curveKey = "";
let curve = null;
let curveTimer = 0;
let latest = null;

function curveProfits(profit) {
  const max = Math.max(200_000, Math.ceil((profit * 1.2) / 50_000) * 50_000);
  const step = (max - CURVE_MIN) / (CURVE_POINTS - 1);
  return Array.from({ length: CURVE_POINTS }, (_, i) => Math.round(CURVE_MIN + step * i));
}

function drawCurve() {
  if (!latest || !curve) return;
  const crossings = findCrossings(curve);
  renderVerdict(latest, curve, crossings);
  renderAdvantage(curve, { profit: latest.input.profit, advantage: latest.summary.advantage }, crossings);
}

function update() {
  const input = readInput();
  $("#profitOut").textContent = money(input.profit);
  $("#netNeedOut").textContent = money(input.netNeed);
  $("#yearsOut").textContent = `${input.years} v`;
  $("#retireYearsOut").textContent = input.retireYears <= 1 ? "kaikki heti" : `${input.retireYears} v`;
  $("#rateOut").textContent = `${String(readNumber("rate")).replace(".", ",")} %`;
  const optimal = $("#optimalMix").checked;
  $("#dividendShare").disabled = optimal;
  $("#dividendShareOut").textContent = optimal ? "automaattinen" : `${readNumber("dividendShare")} %`;

  latest = simulate(input);
  renderWhy(latest);
  renderYears(latest);
  renderYearOne(latest);

  // Käyrä riippuu kaikesta muusta paitsi tuloksesta, joten sitä ei lasketa
  // uudelleen, kun vain tulosta säädetään.
  const profits = curveProfits(input.profit);
  const key = JSON.stringify([{ ...input, profit: 0 }, profits[profits.length - 1]]);
  if (key === curveKey && curve) {
    drawCurve();
    return;
  }
  if (curve) drawCurve();
  clearTimeout(curveTimer);
  curveTimer = setTimeout(() => {
    curve = advantageCurve(input, profits);
    curveKey = key;
    drawCurve();
  }, curve ? 60 : 0);
}

const defaults = new Map();
for (const el of document.querySelectorAll("input, select")) {
  defaults.set(el, el.type === "checkbox" || el.type === "radio" ? el.checked : el.value);
}

$("#reset").addEventListener("click", () => {
  for (const [el, value] of defaults) {
    if (el.type === "checkbox" || el.type === "radio") el.checked = value;
    else el.value = value;
  }
  update();
});

for (const form of [$("#controls"), $("#advancedForm")]) {
  form.addEventListener("input", update);
  form.addEventListener("submit", (event) => event.preventDefault());
}

attachHover($("#advChart"), advantageInfo);
attachHover($("#yearChart"), yearInfo);

let resizeTimer = 0;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!latest) return;
    renderYears(latest);
    drawCurve();
  }, 100);
});

update();
