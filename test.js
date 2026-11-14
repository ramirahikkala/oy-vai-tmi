import assert from "node:assert/strict";
import test from "node:test";
import {
  advantageCurve,
  capitalIncomeTax,
  chooseWithdrawal,
  retire,
  liquidate,
  settleCompany,
  simulate,
  stateTax,
  taxPerson,
  workCredit,
  yelPayment,
} from "./calc.js";

test("valtion veroasteikon rajapyykki", () => {
  assert.equal(stateTax(0), 0);
  assert.equal(stateTax(22_000), 2780.8);
  assert.ok(Math.abs(stateTax(52_100) - 11053.55) < 0.001);
  assert.ok(Math.abs(stateTax(62_100) - (11053.55 + 10_000 * 0.375)) < 0.001);
});

test("työtulovähennys 2026", () => {
  assert.ok(Math.abs(workCredit(10_000, 9_250) - 1_800) < 0.01);
  assert.ok(Math.abs(workCredit(20_000, 19_250) - 3_430) < 0.01);
  assert.ok(Math.abs(workCredit(45_000, 44_250) - 3_245) < 0.01);
  assert.ok(Math.abs(workCredit(60_000, 59_250) - 3_119) < 0.01);
});

test("pääomatulovero ja huojennettu osinko", () => {
  assert.equal(capitalIncomeTax(30_000), 9_000);
  assert.equal(capitalIncomeTax(40_000), 12_400);
  const tax = taxPerson({ dividend: 10_000, nav: 200_000 });
  assert.ok(Math.abs(tax.total - 750) < 0.01, tax.total);
  assert.ok(Math.abs(tax.dividendTaxableCapital - 2_500) < 0.01);
});

test("osingon 150 000 euron ylite", () => {
  const tax = taxPerson({ dividend: 160_000, nav: 10_000_000 });
  // 150 000 × 25 % + 10 000 × 85 % = 46 000 veronalaista pääomatuloa
  assert.ok(Math.abs(tax.dividendTaxableCapital - 46_000) < 0.01);
});

test("YEL-maksu", () => {
  assert.equal(yelPayment(5_000), 0);
  assert.equal(yelPayment(30_000), 7_320);
  assert.ok(Math.abs(yelPayment(30_000, { starter: true }) - 30_000 * 0.244 * 0.78) < 0.02);
});

const near = (actual, expected, tolerance = 1) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} vs ${expected}`);

const BASE = {
  profit: 80_000,
  netNeed: 36_000,
  years: 20,
  rate: 0.07,
  municipalRate: 0.0757,
  yelIncome: 30_000,
  oyExtra: 1_200,
};

test("toiminimen vero, käsin laskettu esimerkki", () => {
  // Tulos 80 000, YEL 7 320, yrittäjävähennys 5 % → ansiotulo 69 046.
  const earned = (80_000 - 7_320) * 0.95;
  const tax = taxPerson({ tmiEarned: earned, yel: 30_000, yelInsured: true, municipalRate: 0.0757 });
  const daily = 30_000 * 0.0111;
  const taxable = earned - daily; // päivärahamaksu vähennetään, perusvähennys on 0
  const state = 11_053.55 + (taxable - 52_100) * 0.375 - 3_119;
  const municipal = taxable * 0.0757;
  const medical = (30_000 - daily) * 0.011;
  near(tax.daily, 333, 0.01);
  near(tax.state, state, 0.01);
  near(tax.municipal, municipal, 0.01);
  near(tax.medical, medical, 0.01);
  near(tax.total, state + municipal + medical + daily + 160, 0.01);
  near(tax.total, 20_185.34, 0.01);
});

test("toiminimen pääomatulo-osuus verotetaan pääomatulona", () => {
  const distributable = (60_000 - 7_320) * 0.95;
  const capital = Math.min(distributable, 40_000 * 0.2);
  const tax = taxPerson({ tmiEarned: distributable - capital, extraCapital: capital, yel: 30_000, yelInsured: true });
  assert.equal(capital, 8_000);
  near(tax.capitalTax, 2_400, 0.01);
});

test("yle-vero lasketaan tuloista, ei YEL-työtulosta", () => {
  assert.equal(taxPerson({ tmiEarned: 5_000, yel: 30_000, yelInsured: true }).yle, 0);
  assert.equal(taxPerson({ tmiEarned: 60_000, yel: 30_000, yelInsured: true }).yle, 160);
});

test("yhteisövero jää yhtiöön ja palkka ei vie yhtiötä miinukselle", () => {
  const empty = { book: 0, unrealized: 0, lossCarry: 0 };
  const plain = settleCompany(empty, { profit: 10_000 });
  assert.equal(plain.corpTax, 2_000);
  assert.equal(plain.company.book, 8_000);

  const capped = settleCompany(empty, { profit: 10_000, salary: 100_000 });
  assert.ok(capped.salary < 10_000);
  assert.ok(capped.company.book >= -0.01);
  assert.equal(capped.corpTax, 0);
});

test("realisoimaton tuotto ei kasvata yhteisöveroa", () => {
  const company = { book: 10_000, unrealized: 0, lossCarry: 0 };
  const deferred = settleCompany(company, { rate: 0.1 });
  assert.equal(deferred.corpTax, 0);
  assert.equal(deferred.company.book, 10_000);
  assert.equal(deferred.company.unrealized, 1_000);

  const realized = settleCompany(company, { rate: 0.1, recognizeAll: true });
  assert.equal(realized.corpTax, 200);
  near(realized.company.book, 10_800, 0.02);
  assert.equal(realized.company.unrealized, 0);
});

test("menot maksetaan vuoden tuloksesta ilman sijoitusten myyntiä", () => {
  const company = { book: 500_000, unrealized: 500_000, lossCarry: 0 };
  const year = settleCompany(company, { profit: 80_000, yel: 7_320, extra: 1_200, salary: 45_000 });
  assert.equal(year.recognized, 0);
  near(year.corpTax, 0.2 * (80_000 - 7_320 - 1_200 - 45_000 * 1.0191), 0.01);
  assert.equal(year.company.unrealized, 500_000);
  near(year.company.book, 500_000 + 80_000 - 7_320 - 1_200 - 45_000 * 1.0191 - year.corpTax, 0.02);
});

test("myynti tulouttaa arvonnousua vain myydyltä osalta", () => {
  const company = { book: 100_000, unrealized: 100_000, lossCarry: 0 };
  const year = settleCompany(company, { dividend: 50_000 });
  assert.equal(year.dividendPaid, 50_000);
  // Puolet myydystä on arvonnousua. Verokin maksetaan myymällä, joten hieman yli 25 000.
  assert.ok(year.recognized > 25_000 && year.recognized < 29_000, year.recognized);
  near(year.corpTax, year.recognized * 0.2, 0.05);
  near(year.company.book + year.company.unrealized, 200_000 - 50_000 - year.corpTax, 0.05);
});

test("yhtiön purku verotetaan luovutusvoittona", () => {
  const company = { book: 1_000_000, unrealized: 0, lossCarry: 0 };
  const none = { basis: 0, market: 0 };
  const input = { municipalRate: 0.0757 };

  // Yli 10 v: olettama 40 % → voitto 600 000 → 9 000 + 570 000 × 34 % + yle 160.
  const long = liquidate(company, none, input, 20);
  near(long.personalTax, 9_000 + 570_000 * 0.34 + 160, 0.01);
  near(long.net, 1_000_000 - long.personalTax, 0.01);

  // Alle 10 v: olettama 20 % → voitto 800 000.
  const short = liquidate(company, none, input, 5);
  near(short.personalTax, 9_000 + 770_000 * 0.34 + 160, 0.01);

  // Sijoitettu pääoma on hankintameno, jos se on olettamaa suurempi.
  const paidIn = liquidate(company, none, { ...input, oyEquity: 900_000 }, 20);
  assert.equal(paidIn.shareGain, 100_000);

  // Arvonnousu tuloutuu ensin yhtiölle.
  const gains = liquidate({ book: 100_000, unrealized: 50_000, lossCarry: 0 }, { basis: 10_000, market: 25_000 }, input, 3);
  assert.equal(gains.corpTax, 10_000);
  assert.equal(gains.equity, 140_000);
  assert.ok(gains.net > 0 && gains.net < 165_000);
});

test("eläkevaihe", () => {
  const company = { book: 100_000, unrealized: 0, lossCarry: 0 };
  const none = { basis: 0, market: 0 };
  const input = { municipalRate: 0.0757, rate: 0, realize: "end" };

  // Yksi eläkevuosi = kaikki myydään heti.
  const now = retire(company, none, input, { years: 1, target: 36_000, careerYears: 20 });
  near(now.usable, liquidate(company, none, input, 20).net);
  assert.equal(now.withdrawn, 0);

  // Ilman tuottoa nostot täyttävät tavoitteen, ja verot + käteen = yhtiön varat.
  const drip = retire(company, none, input, { years: 5, target: 7_000, careerYears: 20 });
  assert.equal(drip.shortYears, 0);
  near(drip.withdrawn, 4 * 7_000, 5);
  near(drip.usable + drip.tax, 100_000, 1);
  for (const p of drip.path.slice(0, -1)) near(p.net, 7_000, 2);

  // Toiminimi: nostot salkusta.
  const pf = { basis: 50_000, market: 100_000 };
  const tmi = retire(null, pf, input, { years: 5, target: 7_000 });
  near(tmi.withdrawn, 4 * 7_000, 5);
  near(tmi.usable + tmi.tax, 100_000, 1);
  assert.equal(pf.market, 100_000, "alkuperäinen salkku ei muutu");

  // Rahat loppuvat kesken.
  const thin = retire(null, { basis: 10_000, market: 10_000 }, input, { years: 5, target: 7_000 });
  assert.ok(thin.shortYears >= 2, thin.shortYears);

  // Tuotto diskontataan: pelkkä odottaminen ei kasvata lukua.
  const grown = retire(null, { basis: 100_000, market: 100_000 }, { ...input, rate: 0.07 }, { years: 10, target: 0 });
  assert.ok(grown.usable < 100_000 && grown.usable > 85_000, grown.usable);
});

test("osingon osuus pakottaa palkan ja osingon jaon", () => {
  const input = { municipalRate: 0.0757, oyExtra: 0, otherCapital: 0, externalSalary: 0, yelIncome: 0 };
  const company = { book: 200_000, unrealized: 0, lossCarry: 0 };
  const opts = { profit: 50_000, yel: 0, need: 10_000, rate: 0, recognizeAll: false };
  const dividend = chooseWithdrawal(company, { ...input, dividendShare: 1 }, opts);
  const salary = chooseWithdrawal(company, { ...input, dividendShare: 0 }, opts);
  assert.ok(dividend.net >= 10_000 - 1);
  assert.ok(dividend.salary < 1, dividend.salary);
  assert.ok(dividend.dividend > 10_000);
  assert.ok(salary.net >= 10_000 - 1);
  assert.ok(salary.dividend < 1, salary.dividend);
  assert.ok(salary.salary > 5_000);
});

test("osingon jako 8 %:n rajalla", () => {
  const soft = taxPerson({ dividend: 10_000, nav: 200_000 });
  near(soft.dividendCapitalGross, 10_000, 0.01);
  near(soft.dividendTaxFree, 7_500, 0.01);
  near(soft.dividendTaxableCapital, 2_500, 0.01);

  const over = taxPerson({ dividend: 10_000, nav: 50_000 });
  near(over.dividendCapitalGross, 4_000, 0.01);
  near(over.dividendEarnedGross, 6_000, 0.01);
  near(over.dividendTaxFree, 4_500, 0.01);
  near(over.dividendTaxableCapital, 1_000, 0.01);
  near(over.dividendTaxableEarned, 4_500, 0.01);
});

test("ensimmäinen vuosi oletuksilla", () => {
  const row = simulate({ ...BASE, years: 1, rate: 0 }).rows[0];
  const tmi = row.tmi.detail;
  near(tmi.deduction, (80_000 - 7_320) * 0.05, 0.02);
  near(tmi.taxes.total, 20_185.34, 0.01);
  near(tmi.cash, 80_000 - 7_320 - 20_185.34, 0.01);
  assert.equal(tmi.capital, 0);

  const oy = row.oy.detail;
  assert.ok(oy.net >= 36_000 - 1 && oy.net < 36_050, oy.net);
  near(oy.net, oy.salary + oy.dividend - oy.taxes.total, 0.02);
  near(oy.corp, 0.2 * (80_000 - 7_320 - 1_200 - oy.salary * 1.0191), 0.02);
  near(row.oy.company, 80_000 - 7_320 - 1_200 - oy.salary * 1.0191 - oy.corp - oy.dividend, 0.05);
});

test("pitkä simulointi: sama elämä, eri verot", () => {
  const result = simulate({ ...BASE, years: 15, retireYears: 12 });
  const { tmi, oy, advantage } = result.summary;
  assert.equal(result.rows.length, 15);
  assert.equal(tmi.retirePath.length, 12);
  assert.equal(tmi.retireShortYears, 0);
  assert.equal(oy.retireShortYears, 0);
  near(tmi.retireNet, oy.retireNet, 5);
  assert.equal(tmi.shortfall, 0);
  assert.equal(oy.shortfall, 0);
  near(tmi.cumLiving, 15 * 36_000);
  near(oy.cumLiving, 15 * 36_000);
  assert.equal(tmi.cumCorp, 0);
  assert.ok(oy.cumCorp > 0);
  assert.ok(oy.cumTax + oy.cumCorp < tmi.cumTax - 1_000);
  assert.ok(oy.company > tmi.portfolio);
  near(advantage, oy.total - tmi.total, 0.02);
  near(oy.total, oy.cumLiving + oy.retireNet + oy.leftover, 0.05);
  for (const row of result.rows) {
    for (const key of ["tmi", "oy"]) assert.ok(Number.isFinite(row[key].wealth) && row[key].wealth >= 0);
  }
});

test("muut tulot lasketaan käteen eikä vain veroihin", () => {
  const plain = simulate({ ...BASE, years: 1 }).rows[0];
  const extra = simulate({ ...BASE, years: 1, externalSalary: 50_000 }).rows[0];
  near(extra.tmi.detail.cash, 80_000 - 7_320 + 50_000 - extra.tmi.detail.taxes.total, 0.02);
  assert.ok(extra.tmi.detail.cash > plain.tmi.detail.cash + 20_000);
  assert.equal(extra.oy.detail.net >= 36_000 - 1, true);
  // Muu palkka kattaa nettotarpeen, joten yhtiöstä ei nosteta mitään.
  assert.equal(extra.oy.detail.salary, 0);
  assert.equal(extra.oy.detail.dividend, 0);
  assert.ok(extra.oy.company > plain.oy.company);
});

test("matalalla tulolla pääomatulo-osuudeksi valikoituu 0", () => {
  const result = simulate({ profit: 22_000, netNeed: 0, years: 1, rate: 0, yelIncome: 15_000, tmiNav: 40_000, tmiShare: "auto" });
  assert.equal(result.rows[0].tmi.detail.share, 0);
});

test("oy:n etu kasvaa tuloksen mukana ja raja löytyy", () => {
  const curve = advantageCurve(BASE, [55_000, 80_000, 150_000]);
  // Eläkevuodet vaikuttavat: kertamyynti verottaa toiminimen salkun kerralla.
  const lump = simulate({ ...BASE, retireYears: 1 }).summary.advantage;
  const slow = simulate({ ...BASE, retireYears: 25 }).summary.advantage;
  assert.ok(slow > lump, `${slow} vs ${lump}`);
  // 15 työvuoden säästöt eivät riitä 25 eläkevuoteen, toiminimellä vielä vähemmän.
  const long = simulate({ ...BASE, years: 15, retireYears: 25 }).summary;
  assert.ok(long.tmi.retireShortYears > long.oy.retireShortYears, `${long.tmi.retireShortYears} vs ${long.oy.retireShortYears}`);
  assert.equal(curve.length, 3);
  assert.ok(curve[0].advantage < 0, curve[0].advantage);
  assert.ok(curve[1].advantage > 0, curve[1].advantage);
  assert.ok(curve[2].advantage > curve[1].advantage);
  assert.equal(advantageCurve(BASE, [30_000])[0].shortfall, true);
});

test("simulointi pysyy nopeana", () => {
  const started = Date.now();
  simulate({ profit: 120_000, netNeed: 48_000, years: 30, rate: 0.07, yelIncome: 40_000, oyExtra: 1_500, oyEquity: 25_000, tmiNav: 25_000 });
  assert.ok(Date.now() - started < 1500);
});

test("kertymät: kulutettu ja verot vuosittain täsmäävät yhteenvetoon", () => {
  const r = simulate({ profit: 90_000, netNeed: 40_000, years: 8, retireYears: 6, rate: 0 });
  const sum = (xs) => xs.reduce((a, b) => a + b, 0);
  for (const key of ["oy", "tmi"]) {
    const s = r.summary[key];
    const last = r.rows[r.rows.length - 1][key];
    near(last.spent, s.cumLiving, 1);
    near(last.tax, s.cumTax + s.cumCorp, 1);
    // Tuotto 0 %: diskonttaus ei muuta mitään, joten nimelliset eläkerivit summautuvat yhteenvetoon.
    near(sum(s.retirePath.map((p) => p.net)), s.usable, 1);
    near(sum(s.retirePath.map((p) => p.tax)), s.retireTax, 1);
  }
  for (let i = 1; i < r.rows.length; i += 1) {
    assert.ok(r.rows[i].oy.tax >= r.rows[i - 1].oy.tax);
    assert.ok(r.rows[i].tmi.spent >= r.rows[i - 1].tmi.spent);
  }
});
