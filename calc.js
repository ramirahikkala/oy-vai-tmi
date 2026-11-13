// Suomen verovuosi 2026. Lähteet: vero.fi valtion tuloveroasteikko, TVL 125 §
// (työtulovähennys), TVL 106 § (perusvähennys), TVL 30 a § (yrittäjävähennys),
// listaamattoman yhtiön osinko (TVL 33 b §), yhteisövero 20 %, YEL-maksu 24,40 %
// (alaraja 9 423,09 €), sairausvakuutusmaksut (VNA 1026/2025) ja työnantajan
// sairausvakuutusmaksu 1,91 %. Yleisradiovero 2,5 %, katto 160 €.

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
    taxableCapital: soft * 0.25 + aboveSoft * 0.85,
    taxableEarned: earnedDividend * 0.75,
    taxFree: soft * 0.75 + aboveSoft * 0.15 + earnedDividend * 0.25,
  };
}

/**
 * Henkilön verot yhdeltä vuodelta. YEL-maksu ei sisälly veroihin: toiminimellä
 * sen maksaa yrittäjä itse, oy:ssä yhtiö. Sairaanhoitomaksun perusteessa
 * YEL-työtulo korvaa oman yhtiön palkan ja toiminimen ansiotulo-osuuden.
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
  const wages = Math.max(0, salary) + Math.max(0, externalSalary);
  const earningDeduction = Math.min(TAX.earningDeduction, wages);
  const accrualBase = Math.max(0, salary) + Math.max(0, externalSalary) + Math.max(0, tmiEarned);
  const pureEarned = accrualBase - earningDeduction + div.taxableEarned;
  const pureCapital = Math.max(0, extraCapital) + div.taxableCapital;

  const basic = perusvahennys(pureEarned);
  const taxableEarned = Math.max(0, pureEarned - basic);
  const state = stateTax(taxableEarned);
  const municipal = taxableEarned * municipalRate;
  const church = taxableEarned * churchRate;

  const insured = yelInsured && yel >= TAX.yelMin;
  const medicalRaw = insured
    ? Math.max(0, yel) + Math.max(0, externalSalary) - Math.min(TAX.earningDeduction, Math.max(0, externalSalary)) + div.taxableEarned
    : pureEarned;
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
    creditLeft = Math.max(0, creditLeft - other);
  }

  const dailyBase = insured ? Math.max(0, yel) + Math.max(0, externalSalary) : wages + Math.max(0, tmiEarned);
  let daily = 0;
  if (dailyBase >= TAX.dailyAllowanceThreshold) {
    if (insured) {
      daily = TAX.entrepreneurDailyRate * Math.max(0, yel) + TAX.employeeDailyRate * Math.max(0, externalSalary);
    } else {
      daily = TAX.employeeDailyRate * dailyBase;
    }
  }

  const capitalTax = capitalIncomeTax(pureCapital);
  const yleBase = Math.max(pureEarned + pureCapital, insured ? yel : 0);
  const yle = Math.min(TAX.yleMax, TAX.yleRate * Math.max(0, yleBase - TAX.yleThreshold));

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
  };
}

export function cloneCompany(c) {
  return { book: c.book, unrealized: c.unrealized, lossCarry: c.lossCarry };
}

function spend(state, amount) {
  let left = Math.max(0, amount);
  let gain = 0;
  if (left <= 0) return { gain: 0, paid: 0 };
  const market = state.book + state.unrealized;
  const sold = Math.min(left, Math.max(0, market));
  if (sold > 0 && market > 0) {
    gain = state.unrealized * (sold / market);
    state.unrealized -= gain;
    state.book -= sold - gain;
    left -= sold;
  }
  return { gain, paid: sold };
}

/**
 * Vie yhtiötä yhden vuoden. Yhtiö ei velkaannu: palkka ja osinko leikataan,
 * jos kassa ja realisoitavat sijoitukset eivät riitä. recognizeAll kirjaa
 * koko arvonnousun veronalaisena.
 */
export function settleCompany(company, opts) {
  const rate = opts.rate || 0;
  const profit = opts.profit || 0;
  const yel = Math.max(0, opts.yel || 0);
  const extra = Math.max(0, opts.extra || 0);
  const marketAfterReturn = (company.book + company.unrealized) * (1 + rate);
  const funds = Math.max(0, marketAfterReturn + Math.max(0, profit));
  let salary = Math.max(0, opts.salary || 0);
  const maxSalary = Math.max(0, (funds - yel - extra) / (1 + TAX.employerHealth));
  if (salary > maxSalary) salary = Math.max(0, maxSalary);
  const salaryCost = salary * (1 + TAX.employerHealth);

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
    if (profit > 0) c.book += profit;

    const fixedSpend = spend(c, yel + extra + salaryCost);
    recognized += fixedSpend.gain;

    const taxSpend = spend(c, taxGuess);
    recognized += taxSpend.gain;

    const marketLeft = Math.max(0, c.book + c.unrealized);
    const dividendPaid = Math.min(Math.max(0, opts.dividend || 0), marketLeft);
    recognized += spend(c, dividendPaid).gain;

    const paidCosts = Math.min(yel + extra + salaryCost, fixedSpend.paid);
    let taxable = profit + recognized - paidCosts;
    let lossCarry = company.lossCarry;
    if (taxable < 0) {
      lossCarry += -taxable;
      taxable = 0;
    } else {
      const used = Math.min(lossCarry, taxable);
      lossCarry -= used;
      taxable -= used;
    }
    const corpTax = TAX.corp * Math.max(0, taxable);
    c.lossCarry = lossCarry;
    last = { company: c, corpTax, recognized, dividendPaid, salary, salaryCost, taxPaid: taxSpend.paid };
    if (Math.abs(corpTax - taxGuess) < 0.05) break;
    taxGuess = corpTax;
  }

  if (last && last.taxPaid + 0.5 < last.corpTax) {
    spend(last.company, last.corpTax - last.taxPaid);
  }

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

function ownerNet(salary, dividend, taxes) {
  return salary + dividend - taxes.total;
}

/**
 * Etsii palkan ja osingon.
 * mode "hold": täytä nettotarve ja jätä mahdollisimman paljon yhtiöön.
 * mode "drain": nosta vuoden ylijäämä (jätä vähintään floor euroa kirjanpitoarvoa),
 * ja jos nettotarve vaatii, pura floorin alle.
 */
export function chooseWithdrawal(company, input, opts) {
  const { profit, yel, need, rate, recognizeAll, mode, floor } = opts;
  const base = personSettings(input);

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
      net: ownerNet(settled.salary, settled.dividendPaid, taxes),
      salary: settled.salary,
      dividend: settled.dividendPaid,
    };
  };

  const maxSalary = Math.max(10_000, Math.min(250_000, Math.max(profit, need) * 1.35));
  const steps = 48;
  const step = maxSalary / steps;
  const salaries = [0];
  for (let i = 1; i <= steps; i += 1) salaries.push(step * i);

  const maxDividendRoom = () => {
    const open = settleCompany(company, {
      profit,
      yel,
      extra: input.oyExtra,
      rate,
      salary: 0,
      dividend: 0,
      recognizeAll: true,
    });
    return Math.max(0, open.company.book + open.company.unrealized);
  };
  const room = maxDividendRoom();

  if (mode === "hold") {
    let best = null;
    for (const salary of salaries) {
      const atZero = probe(salary, 0);
      let chosen = atZero;
      if (atZero.net < need - 1 && room > 0) {
        let lo = 0;
        let hi = room;
        let feasible = null;
        for (let i = 0; i < 18; i += 1) {
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
      const wealth = chosen.settled.company.book + chosen.settled.company.unrealized;
      const meets = chosen.net >= need - 1;
      if (
        !best ||
        (meets && !best.meets) ||
        (meets === best.meets && wealth > best.wealth + 1) ||
        (meets === best.meets && Math.abs(wealth - best.wealth) <= 1 && chosen.net > best.choice.net)
      ) {
        best = { meets, wealth, choice: chosen };
      }
    }
    return best.choice;
  }

  let best = null;
  const score = (choice) => choice.settled.company.book + choice.settled.company.unrealized;
  for (const salary of salaries) {
    let lo = 0;
    let hi = room;
    let keep = probe(salary, 0);
    for (let i = 0; i < 16; i += 1) {
      const mid = (lo + hi) / 2;
      const trial = probe(salary, mid);
      if (score(trial) > floor) lo = mid;
      else hi = mid;
      keep = trial;
    }
    const atFloor = probe(salary, hi);
    let choice = atFloor.net >= keep.net ? atFloor : keep;
    if (choice.net < need) {
      const extra = probe(salary, room);
      if (extra.net > choice.net) choice = extra;
    }
    if (!best || choice.net > best.net + 0.5) best = choice;
  }
  return best;
}

function tmiSplit(profitAfterYel, lossCarry, nav, shareChoice) {
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
  const deduction = income > 0 ? income * TAX.entrepreneurDeduction : 0;
  const distributable = income - deduction;
  const shares = shareChoice === "auto" ? [0, 0.1, 0.2] : [shareChoice];
  return { loss, distributable, shares, deduction };
}

function taxTmiBusiness(distributable, nav, share, input) {
  const capital = Math.min(distributable, Math.max(0, nav) * share);
  const earned = distributable - capital;
  const taxes = taxPerson({
    ...personSettings(input),
    tmiEarned: earned,
    extraCapital: capital,
  });
  return { taxes, capital, earned };
}

function chooseTmiShare(distributable, nav, input, shareChoice) {
  const shares = shareChoice === "auto" ? [0, 0.1, 0.2] : [shareChoice];
  let best = null;
  for (const share of shares) {
    const result = taxTmiBusiness(distributable, nav, share, input);
    if (!best || result.taxes.total < best.taxes.total) best = { share, ...result };
  }
  return best;
}

function growPortfolio(portfolio, rate) {
  portfolio.market = round2(portfolio.market * (1 + rate));
}

function payPortfolioTax(portfolio, tax, realize) {
  portfolio.market = round2(portfolio.market - tax);
  if (realize) portfolio.basis = portfolio.market;
}

function addCash(portfolio, cash) {
  if (cash === 0) return;
  portfolio.basis = round2(portfolio.basis + cash);
  portfolio.market = round2(portfolio.market + cash);
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
    const gain = mid * gainRatio;
    const net = mid - taxOn(gain);
    if (net >= netNeeded) hi = mid;
    else lo = mid;
  }
  const sold = Math.min(market, hi);
  const gain = sold * gainRatio;
  const tax = taxOn(gain);
  portfolio.market = round2(market - sold);
  portfolio.basis = round2(portfolio.basis * (1 - sold / market));
  return { takenNet: round2(sold - tax), gain, tax };
}

function latentPortfolioTax(portfolio) {
  const gain = Math.max(0, portfolio.market - portfolio.basis);
  return capitalIncomeTax(gain);
}

export function companyMarket(company) {
  return company.book + company.unrealized;
}

export function liquidate(company, portfolio, input) {
  const settled = settleCompany(company, {
    profit: 0,
    rate: 0,
    salary: 0,
    dividend: 0,
    yel: 0,
    extra: 0,
    recognizeAll: true,
  });
  const equity = Math.max(0, settled.company.book + settled.company.unrealized);
  const gain = Math.max(0, portfolio.market - portfolio.basis);
  const taxes = taxPerson({
    dividend: equity,
    nav: equity,
    extraCapital: gain,
    municipalRate: input.municipalRate,
    churchRate: input.churchRate,
    children: input.children,
    age65: input.age65,
    yelInsured: false,
  });
  return {
    net: round2(equity + portfolio.market - taxes.total),
    equity: round2(equity),
    corpTax: settled.corpTax,
    personalTax: round2(taxes.total),
    gross: round2(companyMarket(company) + portfolio.market),
    afterCorp: round2(equity + portfolio.market - latentPortfolioTax(portfolio)),
  };
}

function normalize(input) {
  const years = Math.max(1, Math.min(40, Math.round(input.years || 1)));
  return {
    profit: Number(input.profit) || 0,
    profitGrowth: Number(input.profitGrowth) || 0,
    netNeed: Math.max(0, Number(input.netNeed) || 0),
    needGrowth: Number(input.needGrowth) || 0,
    years,
    rate: Number(input.rate) || 0,
    realize: input.realize === "annual" ? "annual" : "end",
    municipalRate: Number(input.municipalRate) || 0,
    churchRate: Math.max(0, Number(input.churchRate) || 0),
    yelIncome: Math.max(0, Number(input.yelIncome) || 0),
    yelStarter: Boolean(input.yelStarter),
    oyExtra: Math.max(0, Number(input.oyExtra) || 0),
    tmiNav: Math.max(0, Number(input.tmiNav) || 0),
    oyEquity: Math.max(0, Number(input.oyEquity) || 0),
    personal: Math.max(0, Number(input.personal) || 0),
    externalSalary: Math.max(0, Number(input.externalSalary) || 0),
    otherCapital: Math.max(0, Number(input.otherCapital) || 0),
    children: Math.max(0, Math.round(Number(input.children) || 0)),
    age65: Boolean(input.age65),
    tmiShare: input.tmiShare === 0 || input.tmiShare === 0.1 || input.tmiShare === 0.2 ? input.tmiShare : "auto",
  };
}

function stepPortfolioGain(portfolio, rate, realize) {
  const before = portfolio.market;
  growPortfolio(portfolio, rate);
  const gain = realize ? Math.max(0, portfolio.market - portfolio.basis) : 0;
  return { gain, grew: portfolio.market - before };
}

export function simulate(raw) {
  const input = normalize(raw);
  const recognizeAll = input.realize === "annual";
  let tmiLoss = 0;
  let tmi = {
    nav: input.tmiNav,
    portfolio: emptyPortfolio(input.personal),
    cumTax: 0,
    cumYel: 0,
    cumLiving: 0,
    shortfall: 0,
  };
  let hold = {
    company: emptyCompany(input.oyEquity),
    portfolio: emptyPortfolio(input.personal),
    cumTax: 0,
    cumCorp: 0,
    cumYel: 0,
    cumLiving: 0,
    shortfall: 0,
    last: null,
  };
  let drain = {
    company: emptyCompany(input.oyEquity),
    portfolio: emptyPortfolio(input.personal),
    floor: input.oyEquity,
    cumTax: 0,
    cumCorp: 0,
    cumYel: 0,
    cumLiving: 0,
    shortfall: 0,
    last: null,
  };

  const rows = [];
  for (let year = 1; year <= input.years; year += 1) {
    const profit = input.profit * (1 + input.profitGrowth) ** (year - 1);
    const need = input.netNeed * (1 + input.needGrowth) ** (year - 1);
    const starter = input.yelStarter && year <= 4;
    const yel = yelPayment(input.yelIncome, { starter });

    // Toiminimi
    stepPortfolioGain(tmi.portfolio, input.rate, false);
    const annualGain = recognizeAll ? Math.max(0, tmi.portfolio.market - tmi.portfolio.basis) : 0;
    const afterYel = profit - yel;
    const splitBase = tmiSplit(afterYel, tmiLoss, tmi.nav, input.tmiShare);
    tmiLoss = splitBase.loss;
    const picked = chooseTmiShare(splitBase.distributable, tmi.nav, input, input.tmiShare);
    const withGain = taxPerson({
      ...personSettings(input),
      tmiEarned: picked.earned,
      extraCapital: picked.capital + annualGain + input.otherCapital,
    });
    const businessOnly = taxPerson({
      ...personSettings(input),
      tmiEarned: picked.earned,
      extraCapital: picked.capital + input.otherCapital,
    });
    const investmentTax = Math.max(0, withGain.total - businessOnly.total);
    payPortfolioTax(tmi.portfolio, investmentTax, recognizeAll);
    const cash = profit - yel - businessOnly.total;
    let living = cash;
    if (cash >= need) addCash(tmi.portfolio, cash - need);
    else {
      const gap = need - cash;
      const sold = withdrawPortfolio(tmi.portfolio, gap, picked.capital + annualGain + input.otherCapital);
      living = cash + sold.takenNet;
      tmi.shortfall += Math.max(0, need - living);
    }
    tmi.cumTax += businessOnly.total + investmentTax;
    tmi.cumYel += yel;
    tmi.cumLiving += Math.min(need, Math.max(0, living));
    const tmiExit = liquidate(emptyCompany(0), tmi.portfolio, input);

    // Osakeyhtiö, ylijäämä yhtiöön
    const holdChoice = chooseWithdrawal(hold.company, input, {
      profit,
      yel,
      need,
      rate: input.rate,
      recognizeAll,
      mode: "hold",
      floor: 0,
    });
    hold.company = holdChoice.settled.company;
    const holdInvestTax = applyPersonalReturn(hold, input, recognizeAll, holdChoice.taxes.taxableCapital);
    let holdLiving = holdChoice.net;
    if (holdChoice.net >= need) addCash(hold.portfolio, holdChoice.net - need);
    else {
      const sold = withdrawPortfolio(hold.portfolio, need - holdChoice.net, holdChoice.taxes.taxableCapital);
      holdLiving = holdChoice.net + sold.takenNet;
      hold.shortfall += Math.max(0, need - holdLiving);
    }
    hold.cumTax += holdChoice.taxes.total + holdInvestTax;
    hold.cumCorp += holdChoice.settled.corpTax;
    hold.cumYel += yel;
    hold.cumLiving += Math.min(need, Math.max(0, holdLiving));
    hold.last = { salary: holdChoice.salary, dividend: holdChoice.dividend, taxes: holdChoice.taxes, corp: holdChoice.settled.corpTax };
    const holdExit = liquidate(hold.company, hold.portfolio, input);

    // Osakeyhtiö, ylijäämä itselle
    const drainChoice = chooseWithdrawal(drain.company, input, {
      profit,
      yel,
      need,
      rate: input.rate,
      recognizeAll: true,
      mode: "drain",
      floor: drain.floor,
    });
    drain.company = drainChoice.settled.company;
    const drainInvestTax = applyPersonalReturn(drain, input, recognizeAll, drainChoice.taxes.taxableCapital);
    let drainLiving = drainChoice.net;
    if (drainChoice.net >= need) addCash(drain.portfolio, drainChoice.net - need);
    else {
      const sold = withdrawPortfolio(drain.portfolio, need - drainChoice.net, drainChoice.taxes.taxableCapital);
      drainLiving = drainChoice.net + sold.takenNet;
      drain.shortfall += Math.max(0, need - drainLiving);
    }
    drain.cumTax += drainChoice.taxes.total + drainInvestTax;
    drain.cumCorp += drainChoice.settled.corpTax;
    drain.cumYel += yel;
    drain.cumLiving += Math.min(need, Math.max(0, drainLiving));
    drain.last = { salary: drainChoice.salary, dividend: drainChoice.dividend, taxes: drainChoice.taxes, corp: drainChoice.settled.corpTax };
    const drainExit = liquidate(drain.company, drain.portfolio, input);

    rows.push({
      year,
      profit: round2(profit),
      need: round2(need),
      yel,
      tmi: snapshot("tmi", tmiExit, tmi, { share: picked.share, earned: picked.earned, capital: picked.capital, taxes: businessOnly }),
      hold: snapshot("hold", holdExit, hold, hold.last),
      drain: snapshot("drain", drainExit, drain, drain.last),
    });
  }

  return {
    input,
    rows,
    summary: {
      tmi: summarize(rows, "tmi", input),
      hold: summarize(rows, "hold", input),
      drain: summarize(rows, "drain", input),
    },
  };
}

function applyPersonalReturn(bag, input, recognizeAll, taxableCapitalAlready) {
  const before = bag.portfolio.market;
  growPortfolio(bag.portfolio, input.rate);
  if (!recognizeAll) return 0;
  const gain = Math.max(0, bag.portfolio.market - bag.portfolio.basis);
  const tax = capitalIncomeTax(taxableCapitalAlready + gain) - capitalIncomeTax(taxableCapitalAlready);
  payPortfolioTax(bag.portfolio, tax, true);
  if (bag.portfolio.market < before && tax === 0) return 0;
  return round2(tax);
}

function snapshot(kind, exit, bag, detail) {
  const company = bag.company || emptyCompany(0);
  return {
    kind,
    exit: exit.net,
    gross: exit.gross,
    afterCorp: exit.afterCorp,
    equity: exit.equity,
    company: round2(companyMarket(company)),
    companyBook: round2(company.book),
    portfolio: round2(bag.portfolio.market),
    shortfall: round2(bag.shortfall),
    cumTax: round2(bag.cumTax),
    cumCorp: round2(bag.cumCorp || 0),
    cumYel: round2(bag.cumYel),
    cumLiving: round2(bag.cumLiving),
    detail,
  };
}

function summarize(rows, key, input) {
  const last = rows[rows.length - 1][key];
  let profit = 0;
  for (const row of rows) profit += row.profit;
  const bagNote = last;
  return {
    years: input.years,
    profit: round2(profit),
    exit: last.exit,
    gross: last.gross,
    afterCorp: last.afterCorp,
    equity: last.equity,
    company: last.company,
    portfolio: last.portfolio,
    shortfall: last.shortfall,
    cumTax: last.cumTax,
    cumCorp: last.cumCorp,
    cumYel: last.cumYel,
    cumLiving: last.cumLiving,
    detail: bagNote.detail,
  };
}
