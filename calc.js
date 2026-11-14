// Suomen verovuosi 2026. Lähteet: vero.fi valtion tuloveroasteikko, TVL 125 §
// (työtulovähennys), TVL 106 § (perusvähennys), TVL 30 a § (yrittäjävähennys),
// TVL 33 b § (listaamattoman yhtiön osinko), TVL 27 ja 46 § (yhtiön purku ja
// hankintameno-olettama), yhteisövero 20 %, YEL-maksu 24,40 % (alaraja
// 9 423,09 €), sairausvakuutusmaksut 2026 ja työnantajan sairausvakuutusmaksu
// 1,91 %. Yleisradiovero 2,5 %, katto 160 €.

export const TAX = {
  year: 2026,
  corp: 0.2,
  capitalLow: 0.3,
  capitalHigh: 0.34,
  capitalThreshold: 30_000,
  yelRate: 0.244,
  yelStarterFactor: 0.78,
  yelMin: 9423.09,
  yelMax: 214_000,
  dailyAllowanceThreshold: 17_255,
  employeeDailyRate: 0.0088,
  entrepreneurDailyRate: 0.0111,
  medicalRate: 0.011,
  medicalSurcharge: 0.0039,
  employerHealth: 0.0191,
  entrepreneurDeduction: 0.05,
  earningDeduction: 750,
  basicMax: 4265,
  basicPhase: 0.18,
  workCreditRate: 0.18,
  workCreditMax: 3430,
  workCreditMax65: 4630,
  workCreditChild: 105,
  workCreditPhaseStart: 35_000,
  workCreditPhaseEnd: 50_550,
  workCreditPhase: 0.02,
  yleRate: 0.025,
  yleThreshold: 15_150,
  yleMax: 160,
  dividendBand: 0.08,
  dividendSoftCap: 150_000,
  presumedCost: 0.2,
  presumedCostLong: 0.4,
  state: [
    { from: 0, base: 0, rate: 0.1264 },
    { from: 22_000, base: 2780.8, rate: 0.19 },
    { from: 32_600, base: 4794.8, rate: 0.3025 },
    { from: 40_100, base: 7063.55, rate: 0.3325 },
    { from: 52_100, base: 11053.55, rate: 0.375 },
  ],
};

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export function yelPayment(tyotulo, { starter = false } = {}) {
  const income = Math.max(0, tyotulo);
  if (income < TAX.yelMin) return 0;
  const base = Math.min(income, TAX.yelMax);
  const rate = TAX.yelRate * (starter ? TAX.yelStarterFactor : 1);
  return round2(base * rate);
}

export function perusvahennys(pureEarned) {
  if (pureEarned <= 0) return 0;
  if (pureEarned <= TAX.basicMax) return pureEarned;
  const amount = TAX.basicMax - TAX.basicPhase * (pureEarned - TAX.basicMax);
  return Math.max(0, amount);
}

export function stateTax(taxable) {
  if (taxable <= 0) return 0;
  let row = TAX.state[0];
  for (const candidate of TAX.state) {
    if (taxable >= candidate.from) row = candidate;
  }
  return row.base + (taxable - row.from) * row.rate;
}

export function capitalIncomeTax(taxable) {
  if (taxable <= 0) return 0;
  const low = Math.min(taxable, TAX.capitalThreshold);
  const high = Math.max(0, taxable - TAX.capitalThreshold);
  return low * TAX.capitalLow + high * TAX.capitalHigh;
}

/**
 * Työtulovähennys. accrualBase on bruttopalkka ja toiminimen ansiotulo-osuus
 * (osingon ansiotulo-osuus ei kerrytä). pureEarned on puhdas ansiotulo
 * tulonhankkimisvähennyksen jälkeen, osingon veronalainen ansiotulo mukana.
 */
export function workCredit(accrualBase, pureEarned, { children = 0, age65 = false } = {}) {
  const cap = (age65 ? TAX.workCreditMax65 : TAX.workCreditMax) + TAX.workCreditChild * Math.max(0, children);
  let credit = Math.min(cap, TAX.workCreditRate * Math.max(0, accrualBase));
  if (pureEarned > TAX.workCreditPhaseStart) {
    const span = Math.min(pureEarned, TAX.workCreditPhaseEnd) - TAX.workCreditPhaseStart;
    credit -= TAX.workCreditPhase * span;
  }
  return Math.max(0, credit);
}

function dividendSplit(dividend, nav) {
  const gross = Math.max(0, dividend);
  const band = Math.max(0, nav) * TAX.dividendBand;
  const capitalDividend = Math.min(gross, band);
  const earnedDividend = gross - capitalDividend;
  const soft = Math.min(capitalDividend, TAX.dividendSoftCap);
  const aboveSoft = capitalDividend - soft;
  return {
    capitalDividend,
    earnedDividend,
    taxableCapital: soft * 0.25 + aboveSoft * 0.85,
    taxableEarned: earnedDividend * 0.75,
    taxFree: soft * 0.75 + aboveSoft * 0.15 + earnedDividend * 0.25,
  };
}

/**
 * Henkilön verot yhdeltä vuodelta. YEL-maksu ei sisälly veroihin: toiminimellä
 * sen maksaa yrittäjä itse, oy:ssä yhtiö. Sairaanhoitomaksun perusteessa
 * YEL-työtulo korvaa oman yhtiön palkan ja toiminimen ansiotulo-osuuden.
 * Päivärahamaksu vähennetään puhtaasta ansiotulosta (TVL 96 §).
 */
export function taxPerson({
  salary = 0,
  externalSalary = 0,
  tmiEarned = 0,
  dividend = 0,
  nav = 0,
  extraCapital = 0,
  yel = 0,
  yelInsured = false,
  municipalRate = 0.0757,
  churchRate = 0,
  children = 0,
  age65 = false,
} = {}) {
  const div = dividendSplit(dividend, nav);
  const ownPay = Math.max(0, salary);
  const outside = Math.max(0, externalSalary);
  const business = Math.max(0, tmiEarned);
  const wages = ownPay + outside;
  const earningDeduction = Math.min(TAX.earningDeduction, wages);
  const accrualBase = wages + business;
  const pureEarned = accrualBase - earningDeduction + div.taxableEarned;
  const pureCapital = Math.max(0, extraCapital) + div.taxableCapital;

  const insured = yelInsured && yel >= TAX.yelMin;
  const yelBase = insured ? Math.max(0, yel) : 0;

  const dailyBase = insured ? yelBase + outside : accrualBase;
  let daily = 0;
  if (dailyBase >= TAX.dailyAllowanceThreshold) {
    daily = insured
      ? TAX.entrepreneurDailyRate * yelBase + TAX.employeeDailyRate * outside
      : TAX.employeeDailyRate * dailyBase;
  }

  const afterDaily = Math.max(0, pureEarned - daily);
  const basic = perusvahennys(afterDaily);
  const taxableEarned = Math.max(0, afterDaily - basic);
  const state = stateTax(taxableEarned);
  const municipal = taxableEarned * municipalRate;
  const church = taxableEarned * churchRate;

  const medicalGross = insured
    ? yelBase + outside - Math.min(TAX.earningDeduction, outside) + div.taxableEarned
    : pureEarned;
  const medicalRaw = Math.max(0, medicalGross - daily);
  const medicalTaxable = Math.max(0, medicalRaw - perusvahennys(medicalRaw));
  const dividendShare = medicalRaw > 0 ? Math.min(1, div.taxableEarned / medicalRaw) : 0;
  const medical = medicalTaxable * (TAX.medicalRate + TAX.medicalSurcharge * dividendShare);

  const credit = workCredit(accrualBase, pureEarned, { children, age65 });
  let statePay = state;
  let municipalPay = municipal;
  let churchPay = church;
  let medicalPay = medical;
  let creditLeft = credit;
  if (creditLeft > 0) {
    const used = Math.min(creditLeft, statePay);
    statePay -= used;
    creditLeft -= used;
  }
  const other = municipalPay + churchPay + medicalPay;
  if (creditLeft > 0 && other > 0) {
    const factor = Math.max(0, 1 - creditLeft / other);
    municipalPay *= factor;
    churchPay *= factor;
    medicalPay *= factor;
  }

  const capitalTax = capitalIncomeTax(pureCapital);
  const yle = Math.min(TAX.yleMax, TAX.yleRate * Math.max(0, pureEarned + pureCapital - TAX.yleThreshold));

  const total = statePay + municipalPay + churchPay + medicalPay + daily + capitalTax + yle;
  return {
    total,
    state: statePay,
    municipal: municipalPay,
    church: churchPay,
    medical: medicalPay,
    daily,
    capitalTax,
    yle,
    taxableEarned,
    taxableCapital: pureCapital,
    workCredit: credit,
    dividendTaxableEarned: div.taxableEarned,
    dividendTaxableCapital: div.taxableCapital,
    dividendTaxFree: div.taxFree,
    dividendCapitalGross: div.capitalDividend,
    dividendEarnedGross: div.earnedDividend,
  };
}

export function cloneCompany(c) {
  return { book: c.book, unrealized: c.unrealized, lossCarry: c.lossCarry };
}

export function companyMarket(company) {
  return company.book + company.unrealized;
}

/** Myy sijoituksia. Myynnistä tuloutuu arvonnousua samassa suhteessa. */
function sell(state, amount) {
  const market = state.book + state.unrealized;
  const sold = Math.min(Math.max(0, amount), Math.max(0, market));
  if (sold <= 0 || market <= 0) return { gain: 0, paid: 0 };
  const gain = state.unrealized * (sold / market);
  state.unrealized -= gain;
  state.book -= sold - gain;
  return { gain, paid: sold };
}

/**
 * Vie yhtiötä yhden vuoden. Menot maksetaan ensin vuoden tuloksesta. Sijoituksia
 * myydään vain, jos tulos ei riitä, ja vasta myynti tulouttaa arvonnousua.
 * Yhtiö ei velkaannu: palkka ja osinko leikataan, jos varat eivät riitä.
 * recognizeAll kirjaa koko arvonnousun veronalaiseksi joka vuosi.
 */
export function settleCompany(company, opts) {
  const rate = opts.rate || 0;
  const profit = opts.profit || 0;
  const yel = Math.max(0, opts.yel || 0);
  const extra = Math.max(0, opts.extra || 0);
  const wanted = Math.max(0, opts.dividend || 0);
  const funds = Math.max(0, companyMarket(company) * (1 + rate) + profit);
  const maxSalary = Math.max(0, (funds - yel - extra) / (1 + TAX.employerHealth));
  const salary = Math.min(Math.max(0, opts.salary || 0), maxSalary);
  const salaryCost = salary * (1 + TAX.employerHealth);
  const costs = yel + extra + salaryCost;

  let taxGuess = 0;
  let last = null;
  for (let i = 0; i < 16; i += 1) {
    const c = cloneCompany(company);
    c.unrealized += (c.book + c.unrealized) * rate;
    let recognized = 0;
    if (opts.recognizeAll && c.unrealized > 0) {
      recognized += c.unrealized;
      c.book += c.unrealized;
      c.unrealized = 0;
    }
    let cash = Math.max(0, profit);
    const pay = (amount) => {
      const fromCash = Math.min(cash, Math.max(0, amount));
      cash -= fromCash;
      const sold = sell(c, amount - fromCash);
      recognized += sold.gain;
      return fromCash + sold.paid;
    };

    const costsPaid = Math.min(costs, pay(costs + Math.max(0, -profit)));
    const taxPaid = pay(taxGuess);
    const dividendPaid = pay(Math.min(wanted, cash + Math.max(0, companyMarket(c))));
    c.book += cash;

    let taxable = profit + recognized - costsPaid;
    let lossCarry = company.lossCarry;
    if (taxable < 0) {
      lossCarry += -taxable;
      taxable = 0;
    } else {
      const used = Math.min(lossCarry, taxable);
      lossCarry -= used;
      taxable -= used;
    }
    const corpTax = TAX.corp * taxable;
    c.lossCarry = lossCarry;
    last = { company: c, corpTax, recognized, dividendPaid, salary, salaryCost, taxPaid };
    if (Math.abs(corpTax - taxGuess) < 0.05) break;
    taxGuess = corpTax;
  }

  if (last.taxPaid + 0.5 < last.corpTax) sell(last.company, last.corpTax - last.taxPaid);

  last.company.book = round2(last.company.book);
  last.company.unrealized = round2(Math.max(0, last.company.unrealized));
  last.company.lossCarry = round2(Math.max(0, last.company.lossCarry));
  last.corpTax = round2(last.corpTax);
  last.dividendPaid = round2(Math.max(0, last.dividendPaid));
  last.salary = round2(last.salary);
  return last;
}

function emptyCompany(book) {
  return { book: round2(Math.max(0, book)), unrealized: 0, lossCarry: 0 };
}

function emptyPortfolio(market) {
  const value = round2(Math.max(0, market));
  return { basis: value, market: value };
}

function personSettings(input) {
  const yelIncome = Math.max(0, input.yelIncome || 0);
  return {
    externalSalary: input.externalSalary,
    yel: yelIncome,
    yelInsured: yelIncome >= TAX.yelMin,
    municipalRate: input.municipalRate,
    churchRate: input.churchRate,
    children: input.children,
    age65: input.age65,
  };
}

/** Muu kuin yrityksestä tuleva tulo, joka on käytettävissä nettotarpeeseen. */
function outsideIncome(input) {
  return Math.max(0, input.externalSalary || 0) + Math.max(0, input.otherCapital || 0);
}

/**
 * Etsii palkan ja osingon niin, että nettotarve täyttyy ja yhtiöön jää
 * mahdollisimman paljon. net sisältää myös muut tulot, ja vero on koko
 * henkilövero kaikista tuloista.
 */
export function chooseWithdrawal(company, input, opts) {
  const { profit, yel, need, rate, recognizeAll } = opts;
  const base = personSettings(input);
  const outside = outsideIncome(input);

  const probe = (salary, dividend) => {
    const settled = settleCompany(company, {
      profit,
      yel,
      extra: input.oyExtra,
      rate,
      salary,
      dividend,
      recognizeAll,
    });
    const taxes = taxPerson({
      ...base,
      salary: settled.salary,
      dividend: settled.dividendPaid,
      nav: company.book,
      extraCapital: input.otherCapital,
    });
    return {
      settled,
      taxes,
      net: settled.salary + settled.dividendPaid + outside - taxes.total,
      salary: settled.salary,
      dividend: settled.dividendPaid,
      wealth: companyMarket(settled.company),
    };
  };

  const open = settleCompany(company, {
    profit,
    yel,
    extra: input.oyExtra,
    rate,
    salary: 0,
    dividend: 0,
    recognizeAll: true,
  });
  const room = Math.max(0, companyMarket(open.company));

  if (input.dividendShare !== "auto" && input.dividendShare != null) {
    const share = Math.min(1, Math.max(0, Number(input.dividendShare) || 0));
    const at = (gross) => probe(gross * (1 - share), gross * share);
    const funds = Math.max(0, companyMarket(company) * (1 + (rate || 0)) + Math.max(0, profit));
    const cap = Math.max(funds, room, need * 4, 10_000);
    const none = at(0);
    if (none.net >= need - 1) return none;
    const top = at(cap);
    if (top.net < need - 1) return top;
    let lo = 0;
    let hi = cap;
    let best = top;
    for (let i = 0; i < 22; i += 1) {
      const mid = (lo + hi) / 2;
      const trial = at(mid);
      if (trial.net >= need - 1) {
        best = trial;
        hi = mid;
      } else {
        lo = mid;
      }
    }
    return best;
  }

  const maxSalary = Math.max(10_000, Math.min(250_000, Math.max(profit, need) * 1.35));
  const steps = 48;
  let best = null;
  for (let i = 0; i <= steps; i += 1) {
    const salary = (maxSalary / steps) * i;
    let chosen = probe(salary, 0);
    if (chosen.net < need - 1 && room > 0) {
      let lo = 0;
      let hi = room;
      let feasible = null;
      for (let j = 0; j < 18; j += 1) {
        const mid = (lo + hi) / 2;
        const trial = probe(salary, mid);
        if (trial.net >= need) {
          feasible = trial;
          hi = mid;
        } else {
          lo = mid;
        }
      }
      chosen = feasible || probe(salary, room);
    }
    const meets = chosen.net >= need - 1;
    if (
      !best ||
      (meets && !best.meets) ||
      (meets === best.meets && chosen.wealth > best.choice.wealth + 1) ||
      (meets === best.meets && Math.abs(chosen.wealth - best.choice.wealth) <= 1 && chosen.net > best.choice.net)
    ) {
      best = { meets, choice: chosen };
    }
    if (meets && chosen.dividend < 0.01 && salary > 0) break;
  }
  return best.choice;
}

function tmiSplit(profitAfterYel, lossCarry) {
  let income = profitAfterYel;
  let loss = lossCarry;
  if (income < 0) {
    loss += -income;
    income = 0;
  } else {
    const used = Math.min(loss, income);
    loss -= used;
    income -= used;
  }
  const deduction = income * TAX.entrepreneurDeduction;
  return { loss, distributable: income - deduction, deduction };
}

function chooseTmiShare(distributable, nav, input) {
  const shares = input.tmiShare === "auto" ? [0, 0.1, 0.2] : [input.tmiShare];
  let best = null;
  for (const share of shares) {
    const capital = Math.min(distributable, Math.max(0, nav) * share);
    const earned = distributable - capital;
    const taxes = taxPerson({
      ...personSettings(input),
      tmiEarned: earned,
      extraCapital: capital + input.otherCapital,
    });
    if (!best || taxes.total < best.taxes.total) best = { share, capital, earned, taxes };
  }
  return best;
}

function addCash(portfolio, cash) {
  if (cash <= 0) return;
  portfolio.basis = round2(portfolio.basis + cash);
  portfolio.market = round2(portfolio.market + cash);
}

/**
 * Oman salkun vuosi: tuotto, ja jos tuotto realisoituu joka vuosi, vero siitä
 * muun pääomatulon päälle. Palauttaa maksetun veron.
 */
function growPortfolio(portfolio, rate, realize, taxableCapitalAlready) {
  portfolio.market = round2(portfolio.market * (1 + rate));
  if (!realize) return 0;
  const gain = Math.max(0, portfolio.market - portfolio.basis);
  const tax = capitalIncomeTax(taxableCapitalAlready + gain) - capitalIncomeTax(taxableCapitalAlready);
  portfolio.market = round2(portfolio.market - tax);
  portfolio.basis = portfolio.market;
  return tax;
}

/**
 * Myy salkusta niin, että käteen jää netNeeded. Vero lasketaan lisäyksenä
 * jo kertyneen veronalaisen pääomatulon päälle.
 */
export function withdrawPortfolio(portfolio, netNeeded, taxableCapitalAlready) {
  if (netNeeded <= 0 || portfolio.market <= 1) return { takenNet: 0, gain: 0, tax: 0 };
  const market = portfolio.market;
  const gainRatio = Math.max(0, market - portfolio.basis) / market;
  const taxOn = (gain) => capitalIncomeTax(taxableCapitalAlready + gain) - capitalIncomeTax(taxableCapitalAlready);
  let lo = 0;
  let hi = market;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    if (mid - taxOn(mid * gainRatio) >= netNeeded) hi = mid;
    else lo = mid;
  }
  const sold = Math.min(market, hi);
  const gain = sold * gainRatio;
  const tax = taxOn(gain);
  portfolio.market = round2(market - sold);
  portfolio.basis = round2(portfolio.basis * (1 - sold / market));
  return { takenNet: round2(sold - tax), gain, tax };
}

function discount(amount, rate, yearsAhead) {
  if (!yearsAhead || !rate) return amount;
  return amount / (1 + rate) ** yearsAhead;
}

/**
 * Lopetus. Yhtiö puretaan: sijoitusten arvonnousu tuloutuu yhtiölle (20 %), ja
 * omistajan jako-osa verotetaan luovutusvoittona (TVL 27 §). Hankintameno on
 * sijoitettu pääoma tai hankintameno-olettama, kumpi on suurempi: 20 %, ja
 * 40 % kun osakkeet on omistettu vähintään 10 vuotta. Oma salkku myydään
 * samana vuonna, ja voitot verotetaan yhdessä.
 */
export function liquidate(company, portfolio, input, ownedYears = 0) {
  const settled = settleCompany(company, { recognizeAll: true });
  const equity = Math.max(0, companyMarket(settled.company));
  const presumed = equity * (ownedYears >= 10 ? TAX.presumedCostLong : TAX.presumedCost);
  const cost = Math.max(Math.max(0, input.oyEquity || 0), presumed);
  const shareGain = Math.max(0, equity - cost);
  const portfolioGain = Math.max(0, portfolio.market - portfolio.basis);
  const gains = shareGain + portfolioGain;
  const personalTax = gains > 0
    ? taxPerson({ extraCapital: gains, municipalRate: input.municipalRate, churchRate: input.churchRate }).total
    : 0;
  return {
    net: round2(equity + portfolio.market - personalTax),
    equity: round2(equity),
    corpTax: settled.corpTax,
    personalTax: round2(personalTax),
    shareGain: round2(shareGain),
  };
}

/**
 * Eläkevaihe, sama molemmille poluille. Joka vuosi nostetaan target(y) euroa
 * verojen jälkeen: oy:stä ensin osinkona, ja jos yhtiö ei riitä, omasta
 * salkusta. Toiminimellä (company null) nostot tulevat salkusta. Viimeisenä
 * eläkevuonna kaikki loput myydään ja yhtiö puretaan. Vuosi 0 on työuran
 * päättymishetki, ja myöhemmät eurot muutetaan sen hetken rahaksi
 * sijoitustuotolla, jotta pelkkä odottaminen ei kasvata lukua.
 */
export function retire(company, portfolio, input, { years = 1, target = 0, careerYears = 0 } = {}) {
  const rate = Number(input.rate) || 0;
  const realize = input.realize === "annual";
  const total = Math.max(1, Math.round(Number(years) || 1));
  const wantOf = typeof target === "function" ? target : () => Math.max(0, Number(target) || 0);
  const person = (dividend, nav) => taxPerson({
    dividend,
    nav,
    municipalRate: input.municipalRate,
    churchRate: input.churchRate,
  });
  let co = company ? cloneCompany(company) : emptyCompany(0);
  const pf = { basis: portfolio.basis, market: portfolio.market };
  let withdrawn = 0;
  let leftover = 0;
  let taxes = 0;
  let shortYears = 0;
  const path = [];

  for (let y = 0; y < total; y += 1) {
    const grow = y > 0;
    const pv = (value) => discount(value, rate, y);

    if (y === total - 1) {
      let tax = 0;
      if (grow) {
        const settled = settleCompany(co, { rate, recognizeAll: realize });
        co = settled.company;
        tax += settled.corpTax + growPortfolio(pf, rate, realize, 0);
      }
      const exit = liquidate(co, pf, input, careerYears + y);
      leftover = pv(exit.net);
      taxes += pv(tax + exit.corpTax + exit.personalTax);
      path.push({
        year: y + 1,
        net: round2(exit.net),
        tax: round2(tax + exit.corpTax + exit.personalTax),
        wealth: round2(exit.net),
        final: true,
      });
      break;
    }

    const want = Math.max(0, wantOf(y));
    let net = 0;
    let tax = 0;
    let capital = 0;
    if (companyMarket(co) > 1) {
      const nav = co.book;
      const probe = (dividend) => {
        const settled = settleCompany(co, { dividend, rate: grow ? rate : 0, recognizeAll: grow && realize });
        const t = person(settled.dividendPaid, nav);
        return { settled, t, net: settled.dividendPaid - t.total };
      };
      let pick = probe(0);
      if (want > 0) {
        const all = probe(companyMarket(co) * (1 + rate) * 2 + 1);
        pick = all;
        if (all.net > want) {
          let lo = 0;
          let hi = all.settled.dividendPaid;
          for (let i = 0; i < 30 && hi - lo > 1; i += 1) {
            const mid = (lo + hi) / 2;
            const trial = probe(mid);
            if (trial.net >= want) {
              pick = trial;
              hi = mid;
            } else {
              lo = mid;
            }
          }
        }
      }
      co = pick.settled.company;
      net += pick.net;
      tax += pick.t.total + pick.settled.corpTax;
      capital = pick.t.taxableCapital;
    }
    if (grow) tax += growPortfolio(pf, rate, realize, capital);
    if (net < want - 0.5 && pf.market > 1) {
      const sold = withdrawPortfolio(pf, want - net, capital);
      net += sold.takenNet;
      tax += sold.tax;
    }
    if (net < want - 1) shortYears += 1;
    withdrawn += pv(net);
    taxes += pv(tax);
    path.push({
      year: y + 1,
      net: round2(net),
      tax: round2(tax),
      wealth: liquidate(co, pf, input, careerYears + y).net,
      final: false,
    });
  }

  return {
    usable: round2(withdrawn + leftover),
    withdrawn: round2(withdrawn),
    leftover: round2(leftover),
    tax: round2(taxes),
    shortYears,
    path,
  };
}

function normalize(input) {
  const num = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const auto = (value) => value == null || value === "" || value === "auto";
  return {
    profit: num(input.profit),
    profitGrowth: num(input.profitGrowth),
    netNeed: Math.max(0, num(input.netNeed)),
    needGrowth: num(input.needGrowth),
    years: Math.max(1, Math.min(40, Math.round(num(input.years, 1)))),
    retireYears: Math.max(1, Math.min(50, Math.round(num(input.retireYears, 25)))),
    rate: num(input.rate),
    realize: input.realize === "annual" ? "annual" : "end",
    municipalRate: num(input.municipalRate, 0.0757),
    churchRate: Math.max(0, num(input.churchRate)),
    yelIncome: Math.max(0, num(input.yelIncome)),
    yelStarter: Boolean(input.yelStarter),
    oyExtra: Math.max(0, num(input.oyExtra)),
    tmiNav: Math.max(0, num(input.tmiNav)),
    oyEquity: Math.max(0, num(input.oyEquity)),
    personal: Math.max(0, num(input.personal)),
    externalSalary: Math.max(0, num(input.externalSalary)),
    otherCapital: Math.max(0, num(input.otherCapital)),
    children: Math.max(0, Math.round(num(input.children))),
    age65: Boolean(input.age65),
    tmiShare: input.tmiShare === 0 || input.tmiShare === 0.1 || input.tmiShare === 0.2 ? input.tmiShare : "auto",
    postWithdrawal: auto(input.postWithdrawal) ? "auto" : Math.max(0, num(input.postWithdrawal)),
    dividendShare: auto(input.dividendShare) ? "auto" : Math.min(1, Math.max(0, num(input.dividendShare))),
  };
}

/**
 * Kaksi polkua samasta tuloksesta: toiminimi, jossa ylijäämä sijoitetaan omaan
 * salkkuun, ja osakeyhtiö, jossa ylijäämä jää yhtiöön ja sijoitetaan siellä.
 * Työvuosien rivien wealth on varallisuus verojen jälkeen, jos kaikki
 * myytäisiin sen vuoden lopussa. Eläkevaihe lasketaan kerran, työuran lopusta.
 */
export function simulate(raw) {
  const input = normalize(raw);
  const realize = input.realize === "annual";
  const outside = outsideIncome(input);
  let tmiLoss = 0;
  const tmi = { portfolio: emptyPortfolio(input.personal), cumTax: 0, cumYel: 0, cumLiving: 0, shortfall: 0 };
  const oy = {
    company: emptyCompany(input.oyEquity),
    portfolio: emptyPortfolio(input.personal),
    cumTax: 0,
    cumCorp: 0,
    cumYel: 0,
    cumCosts: 0,
    cumLiving: 0,
    shortfall: 0,
  };

  const rows = [];
  for (let year = 1; year <= input.years; year += 1) {
    const profit = input.profit * (1 + input.profitGrowth) ** (year - 1);
    const need = input.netNeed * (1 + input.needGrowth) ** (year - 1);
    const yel = yelPayment(input.yelIncome, { starter: input.yelStarter && year <= 4 });

    // Toiminimi
    const split = tmiSplit(profit - yel, tmiLoss);
    tmiLoss = split.loss;
    const picked = chooseTmiShare(split.distributable, input.tmiNav, input);
    const tmiCapital = picked.taxes.taxableCapital;
    const tmiInvestTax = growPortfolio(tmi.portfolio, input.rate, realize, tmiCapital);
    const tmiCash = profit - yel + outside - picked.taxes.total;
    let tmiLiving = tmiCash;
    if (tmiCash >= need) addCash(tmi.portfolio, tmiCash - need);
    else {
      const sold = withdrawPortfolio(tmi.portfolio, need - tmiCash, tmiCapital);
      tmi.cumTax += sold.tax;
      tmiLiving = tmiCash + sold.takenNet;
      tmi.shortfall += Math.max(0, need - tmiLiving);
    }
    tmi.cumTax += picked.taxes.total + tmiInvestTax;
    tmi.cumYel += yel;
    tmi.cumLiving += Math.min(need, Math.max(0, tmiLiving));
    const tmiExit = liquidate(emptyCompany(0), tmi.portfolio, input, year);
    const tmiDetail = {
      share: picked.share,
      earned: round2(picked.earned),
      capital: round2(picked.capital),
      deduction: round2(split.deduction),
      distributable: round2(split.distributable),
      taxes: picked.taxes,
      cash: round2(tmiCash),
      saved: round2(Math.max(0, tmiCash - need)),
    };

    // Osakeyhtiö
    const nav = oy.company.book;
    const choice = chooseWithdrawal(oy.company, input, {
      profit,
      yel,
      need,
      rate: input.rate,
      recognizeAll: realize,
    });
    oy.company = choice.settled.company;
    const oyCapital = choice.taxes.taxableCapital;
    const oyInvestTax = growPortfolio(oy.portfolio, input.rate, realize, oyCapital);
    let oyLiving = choice.net;
    if (choice.net >= need) addCash(oy.portfolio, choice.net - need);
    else {
      const sold = withdrawPortfolio(oy.portfolio, need - choice.net, oyCapital);
      oy.cumTax += sold.tax;
      oyLiving = choice.net + sold.takenNet;
      oy.shortfall += Math.max(0, need - oyLiving);
    }
    const side = choice.settled.salaryCost - choice.salary;
    oy.cumTax += choice.taxes.total + oyInvestTax;
    oy.cumCorp += choice.settled.corpTax;
    oy.cumYel += yel;
    oy.cumCosts += input.oyExtra + side;
    oy.cumLiving += Math.min(need, Math.max(0, oyLiving));
    const oyDetail = {
      salary: choice.salary,
      dividend: choice.dividend,
      taxes: choice.taxes,
      corp: choice.settled.corpTax,
      nav: round2(nav),
      side: round2(side),
      net: round2(choice.net),
      saved: round2(Math.max(0, choice.net - need)),
    };
    const oyExit = liquidate(oy.company, oy.portfolio, input, year);

    rows.push({
      year,
      profit: round2(profit),
      need: round2(need),
      yel,
      tmi: {
        wealth: tmiExit.net,
        spent: round2(tmi.cumLiving),
        tax: round2(tmi.cumTax),
        portfolio: round2(tmi.portfolio.market),
        detail: tmiDetail,
      },
      oy: {
        wealth: oyExit.net,
        spent: round2(oy.cumLiving),
        tax: round2(oy.cumTax + oy.cumCorp),
        company: round2(companyMarket(oy.company)),
        portfolio: round2(oy.portfolio.market),
        detail: oyDetail,
      },
    });
  }

  const target = (y) => (input.postWithdrawal === "auto"
    ? input.netNeed * (1 + input.needGrowth) ** (input.years + y)
    : input.postWithdrawal);
  const plan = { years: input.retireYears, target, careerYears: input.years };
  const tmiRetire = retire(null, tmi.portfolio, input, plan);
  const oyRetire = retire(oy.company, oy.portfolio, input, plan);
  const last = rows[rows.length - 1];
  const summarize = (bag, ret, extra) => ({
    cumLiving: round2(bag.cumLiving),
    cumTax: round2(bag.cumTax),
    cumYel: round2(bag.cumYel),
    shortfall: round2(bag.shortfall),
    retireNet: ret.withdrawn,
    leftover: ret.leftover,
    usable: ret.usable,
    retireTax: ret.tax,
    retireShortYears: ret.shortYears,
    retirePath: ret.path,
    total: round2(bag.cumLiving + ret.usable),
    ...extra,
  });
  const tmiSummary = summarize(tmi, tmiRetire, {
    cumCorp: 0,
    cumCosts: 0,
    company: 0,
    portfolio: last.tmi.portfolio,
    detail: last.tmi.detail,
  });
  const oySummary = summarize(oy, oyRetire, {
    cumCorp: round2(oy.cumCorp),
    cumCosts: round2(oy.cumCosts),
    company: last.oy.company,
    portfolio: last.oy.portfolio,
    detail: last.oy.detail,
  });
  return {
    input,
    rows,
    summary: {
      tmi: tmiSummary,
      oy: oySummary,
      retireTarget: round2(target(0)),
      advantage: round2(oySummary.total - tmiSummary.total),
    },
  };
}

/**
 * Oy:n etu (käteen yhteensä, oy − toiminimi) eri vuosituloksilla. Muut
 * syötteet pysyvät ennallaan.
 */
export function advantageCurve(raw, profits) {
  return profits.map((profit) => {
    const { summary } = simulate({ ...raw, profit });
    return {
      profit,
      advantage: summary.advantage,
      shortfall: summary.tmi.shortfall > 1 || summary.oy.shortfall > 1,
    };
  });
}
