import assert from "node:assert/strict";
import test from "node:test";
import {
  TAX,
  capitalIncomeTax,
  chooseWithdrawal,
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

test("toiminimen vero, käsin laskettu esimerkki", () => {
  const yel = 7_320;
  const distributable = (60_000 - yel) * 0.95;
  const capital = Math.min(distributable, 40_000 * 0.2);
  const earned = distributable - capital;
  const tax = taxPerson({
    tmiEarned: earned,
    extraCapital: capital,
    yel: 30_000,
    yelInsured: true,
    municipalRate: 0.0757,
    churchRate: 0,
  });
  assert.ok(Math.abs(earned - 42_046) < 0.01);
  assert.equal(capital, 8_000);
  assert.ok(Math.abs(tax.capitalTax - 2_400) < 0.01);
  assert.ok(Math.abs(tax.total - 10_827.3) < 1, tax.total);
});

test("yhteisövero jää yhtiöön ja palkka ei vie yhtiötä miinukselle", () => {
  const plain = settleCompany(
    { book: 0, unrealized: 0, lossCarry: 0 },
    { profit: 10_000, salary: 0, dividend: 0, rate: 0 },
  );
  assert.equal(plain.corpTax, 2_000);
  assert.equal(plain.company.book, 8_000);

  const capped = settleCompany(
    { book: 0, unrealized: 0, lossCarry: 0 },
    { profit: 10_000, salary: 100_000, dividend: 0, rate: 0 },
  );
  assert.ok(capped.salary < 10_000);
  assert.ok(capped.company.book >= -0.01);
  assert.equal(capped.corpTax, 0);
});

test("realisoimaton tuotto ei kasvata yhteisöveroa", () => {
  const deferred = settleCompany(
    { book: 10_000, unrealized: 0, lossCarry: 0 },
    { profit: 0, rate: 0.1, recognizeAll: false },
  );
  assert.equal(deferred.corpTax, 0);
  assert.equal(deferred.company.book, 10_000);
  assert.equal(deferred.company.unrealized, 1_000);

  const realized = settleCompany(
    { book: 10_000, unrealized: 0, lossCarry: 0 },
    { profit: 0, rate: 0.1, recognizeAll: true },
  );
  assert.equal(realized.corpTax, 200);
  assert.ok(Math.abs(realized.company.book - 10_800) < 0.02);
  assert.equal(realized.company.unrealized, 0);
});

test("pitkä simulointi: yhtiöön jätetty varallisuus kasvaa, purku ei", () => {
  const result = simulate({
    profit: 80_000,
    netNeed: 36_000,
    years: 15,
    rate: 0.07,
    realize: "end",
    municipalRate: 0.0757,
    churchRate: 0,
    yelIncome: 30_000,
    oyExtra: 1_200,
    tmiNav: 0,
    oyEquity: 0,
    personal: 0,
    tmiShare: "auto",
  });
  const { tmi, hold, drain } = result.summary;
  assert.ok(hold.company > drain.company);
  assert.ok(hold.gross > tmi.gross);
  assert.ok(hold.exit > 0 && tmi.exit > 0 && drain.exit > 0);
  assert.ok(hold.shortfall === 0);
  assert.ok(tmi.shortfall === 0);
  assert.ok(result.rows.length === 15);
  for (const row of result.rows) {
    for (const key of ["tmi", "hold", "drain"]) {
      assert.ok(Number.isFinite(row[key].exit));
      assert.ok(Number.isFinite(row[key].gross));
    }
  }
});

test("matalalla tulolla pääomatulo-osuudeksi valikoituu 0", () => {
  const result = simulate({
    profit: 22_000,
    netNeed: 0,
    years: 1,
    rate: 0,
    municipalRate: 0.0757,
    yelIncome: 15_000,
    tmiNav: 40_000,
    oyEquity: 0,
    oyExtra: 0,
    tmiShare: "auto",
  });
  assert.equal(result.rows[0].tmi.detail.share, 0);
});

test("purku jättää pohjan ja hold säästää", () => {
  const input = {
    externalSalary: 0,
    otherCapital: 0,
    municipalRate: 0.0757,
    churchRate: 0,
    children: 0,
    age65: false,
    oyExtra: 0,
  };
  const company = { book: 20_000, unrealized: 0, lossCarry: 0 };
  const hold = chooseWithdrawal(company, input, {
    profit: 50_000,
    yel: 0,
    need: 10_000,
    rate: 0,
    recognizeAll: false,
    mode: "hold",
    floor: 20_000,
  });
  const drain = chooseWithdrawal(company, input, {
    profit: 50_000,
    yel: 0,
    need: 10_000,
    rate: 0,
    recognizeAll: true,
    mode: "drain",
    floor: 20_000,
  });
  assert.ok(hold.net >= 10_000 - 1);
  assert.ok(hold.settled.company.book > drain.settled.company.book);
  assert.ok(drain.net > hold.net);
});

test("lopetusvero syö osan yhtiön varoista mutta ei vie niitä miinukselle", () => {
  const exit = liquidate(
    { book: 100_000, unrealized: 50_000, lossCarry: 0 },
    { basis: 10_000, market: 25_000 },
    { municipalRate: 0.0757, churchRate: 0, children: 0, age65: false },
  );
  assert.ok(exit.net > 0);
  assert.ok(exit.net < exit.gross);
  assert.ok(exit.corpTax > 0);
});

test("simulointi pysyy sekunnissa", () => {
  const started = Date.now();
  simulate({
    profit: 120_000,
    netNeed: 48_000,
    years: 30,
    rate: 0.07,
    municipalRate: 0.0757,
    yelIncome: 40_000,
    oyExtra: 1_500,
    oyEquity: 25_000,
    tmiNav: 25_000,
  });
  assert.ok(Date.now() - started < 1500);
});
