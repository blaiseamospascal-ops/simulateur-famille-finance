// Module Belgique / Wallonie, salariés du privé.
import { regimeAt, ym, ymIndex } from '../../engine/simulate';
import type { Assumptions, Child, CountryModule, Household, Line, Situation, YearContext, YearResult } from '../../engine/types';
import { AF_WAL_2026, MATERNITY, ONE_PFP_2026, ONEM_2026, PENSION, SOCIAL_2026, SOURCES, taxParams } from './params';
import { csss, householdTax, workBonusMonthly } from './tax';

const BASE_YEAR = 2026;
const round = (x: number) => Math.round(x);

function ageInMonths(c: Child, monthIdx: number) {
  return monthIdx - ymIndex(c.birth);
}

/** Mois de congé de maternité (15 semaines ≈ 3,5 mois, dont 1 avant la naissance). */
function maternityShare(children: Child[], parent: 'A' | 'B', monthIdx: number): number {
  for (const c of children) {
    if (!c.planned || (c.birthParent ?? 'B') !== parent) continue;
    const d = monthIdx - ymIndex(c.birth);
    if (d >= -1 && d <= 1) return 1;
    if (d === 2) return 0.5;
  }
  return 0;
}

function nearestKey(table: Record<number, unknown>, x: number): number {
  const keys = Object.keys(table).map(Number);
  return keys.reduce((best, k) => (Math.abs(k - x) < Math.abs(best - x) ? k : best), keys[0]);
}

export const belgiumWallonia: CountryModule = {
  id: 'be-wal',
  computeYear(ctx: YearContext): YearResult {
    const { year, household: h, situation: s, assumptions: a } = ctx;
    const idx = Math.pow(1 + a.indexRate, Math.max(0, year - BASE_YEAR)); // indexation des barèmes sociaux
    const tp = taxParams(year, a.indexRate);
    const lines: Line[] = [];
    const notes: string[] = [];
    const parents = (['A', 'B'] as const).filter((p) => p === 'A' || h.B);
    const isolated = !h.couple || !h.B;

    // ---- Travail, mois par mois ----
    const perParent = parents.map((p) => {
      const par = p === 'A' ? h.A : h.B!;
      const monthly = ctx.grossMonthly?.[p] ?? par.grossMonthlyFT * ctx.wageFactor[p];
      let gross = 0;
      let fracSum = 0;
      let bonus = { A: 0, B: 0 };
      let onem = 0;
      let maternityGross = 0;
      let unassimilated = 0;
      const leaveMonths: Record<string, number> = {};
      for (let m = 1; m <= 12; m++) {
        const mi = ymIndex(ym(year, m));
        const r = regimeAt(s.periods, p, mi);
        const mat = maternityShare(s.children, p, mi);
        const worked = r.fraction * (1 - mat);
        gross += monthly * worked;
        fracSum += r.fraction;
        if (worked > 0) {
          const wb = workBonusMonthly(monthly, idx);
          bonus.A += wb.A * worked;
          bonus.B += wb.B * worked;
        }
        if (mat > 0) {
          const first = Math.min(monthly, MATERNITY.monthlyCap * idx);
          maternityGross += mat * MATERNITY.rate * first;
        }
        const interrupted = 1 - r.fraction;
        if (interrupted > 0 && r.leave !== 'aucun') {
          const table = r.leave === 'conge-parental' ? ONEM_2026.congeParental : ONEM_2026.creditTemps;
          const k = nearestKey(table, interrupted);
          onem += (isolated ? table[k].iso : table[k].coh) * idx * (1 - mat);
          leaveMonths[`${r.leave}:${k}`] = (leaveMonths[`${r.leave}:${k}`] ?? 0) + 1;
        } else if (interrupted > 0) {
          unassimilated += interrupted / 12;
        }
      }
      const avgFrac = fracSum / 12;
      const thirteenth = monthly * avgFrac;
      const doublePecule = 0.92 * monthly * avgFrac;
      const onss = SOCIAL_2026.onssRate * (gross + thirteenth + 0.85 * monthly * avgFrac);
      const bonusTotal = Math.min(onss, bonus.A + bonus.B);
      const scale = bonus.A + bonus.B > 0 ? bonusTotal / (bonus.A + bonus.B) : 0;
      bonus = { A: bonus.A * scale, B: bonus.B * scale };
      // Congé parental : rappel des durées maximales.
      for (const [k, n] of Object.entries(leaveMonths)) {
        const [type, frac] = k.split(':');
        const max = ONEM_2026.congeParentalMaxMonths[Number(frac)];
        if (type === 'conge-parental' && max && n > max) notes.push(`Parent ${p} : ${n} mois de congé parental ${frac === '1' ? 'complet' : frac} en ${year}, au-delà du maximum de ${max} mois par enfant.`);
      }
      return {
        p,
        label: par.label,
        monthly,
        gross,
        taxableGross: gross + thirteenth + doublePecule,
        personalOnss: onss - bonusTotal,
        bonus,
        onem,
        maternityGross,
        unassimilated,
        avgFrac,
      };
    });

    for (const x of perParent) {
      lines.push({ key: `salaire-${x.p}`, label: `Salaire brut ${x.label} (13e mois et double pécule inclus)`, amount: round(x.taxableGross), group: 'travail', reliability: 'officiel', detail: `${round(x.monthly)} €/mois temps plein, ${Math.round(x.avgFrac * 100)} % en moyenne sur l'année` });
      lines.push({ key: `onss-${x.p}`, label: `Cotisations ONSS ${x.label} (après bonus à l'emploi)`, amount: -round(x.personalOnss), group: 'impots', reliability: 'officiel', source: SOCIAL_2026.source, detail: `13,07 % ; bonus à l'emploi déduit : ${round(x.bonus.A + x.bonus.B)} €` });
      if (x.onem > 0) lines.push({ key: `onem-${x.p}`, label: `Allocation ONEM ${x.label} (brute)`, amount: round(x.onem), group: 'allocations', reliability: 'officiel', source: ONEM_2026.source, detail: 'Montant brut ONEM, ajouté au revenu imposable : l\'impôt ci-dessous en tient compte.' });
      if (x.maternityGross > 0) lines.push({ key: `mat-${x.p}`, label: `Indemnité de maternité ${x.label} (brute)`, amount: round(x.maternityGross), group: 'allocations', reliability: 'approximation', source: MATERNITY.source, detail: '15 semaines, environ 77 % du brut plafonné, imposable.' });
    }

    // ---- Enfants : âges, rangs, à charge ----
    const children = [...s.children].sort((c1, c2) => ymIndex(c1.birth) - ymIndex(c2.birth));
    const dec = ymIndex(ym(year, 12));
    const born = children.filter((c) => ymIndex(c.birth) <= dec);
    const dependents = born.filter((c) => ageInMonths(c, ymIndex(ym(year + 1, 1))) < a.allowanceEndAge * 12);
    // Temps de travail le plus bas des parents (hors congé de maternité) : pilote crèche et stages.
    const minFraction = (mi: number) => Math.min(...parents.map((p) => regimeAt(s.periods, p, mi).fraction));

    // ---- Crèche (jours par enfant) ----
    const crecheDays = children.map((c) => {
      if (!a.creche.use) return 0;
      let days = 0;
      for (let m = 1; m <= 12; m++) {
        const mi = ymIndex(ym(year, m));
        const age = ageInMonths(c, mi);
        if (age < 4 || age >= 30) continue; // après le congé de maternité, jusqu'à l'entrée à l'école (2,5 ans)
        const f = a.creche.adaptToParentTime ? minFraction(mi) : 1;
        days += (a.creche.daysPerYear / 12) * f;
      }
      return days;
    });

    // Impôt en deux passes : le tarif ONE dépend du revenu net, la réduction d'impôt dépend du tarif.
    const taxInputBase = {
      couple: h.couple && !!h.B,
      persons: perParent.map((x) => ({ taxableGross: x.taxableGross, personalOnss: x.personalOnss, workBonus: x.bonus, replacementGross: x.onem + x.maternityGross })),
      dependentChildren: dependents.length,
      childrenUnder3NoChildcare: dependents.filter((c) => ageInMonths(c, ymIndex(ym(year + 1, 1))) < 36 && crecheDays[children.indexOf(c)] === 0).length,
      communalRate: h.communalRate,
    };
    const pass1 = householdTax({ ...taxInputBase, childcare: [] }, tp);
    const netWorkMonthly =
      (perParent.reduce((sum, x) => sum + x.gross * (1 - SOCIAL_2026.onssRate), 0) - pass1.total * (perParent.reduce((s2, x) => s2 + x.gross, 0) / Math.max(1, perParent.reduce((s2, x) => s2 + x.taxableGross, 0))) + perParent.reduce((s2, x) => s2 + (x.onem + x.maternityGross) * 0.85, 0)) / 12;
    const reduced = !h.couple || !h.B || dependents.length >= 3 || crecheDays.filter((d) => d > 0).length >= 2;
    let pfpMonthly = 0;
    let prev = 0;
    for (const t of ONE_PFP_2026.tranches) {
      const top = t.upTo === Infinity ? Infinity : t.upTo * idx;
      if (netWorkMonthly > prev) pfpMonthly += (Math.min(netWorkMonthly, top) - prev) * (reduced ? t.reduced : t.base);
      prev = top;
    }
    const oneDaily = Math.min(ONE_PFP_2026.maxDaily * idx, pfpMonthly / 20);
    const daily = a.creche.type === 'one' ? oneDaily : a.creche.privateDaily * idx;
    const childcare = crecheDays.filter((d) => d > 0).map((d) => ({ days: d, daily }));
    const tax = householdTax({ ...taxInputBase, childcare }, tp);
    const taxNoChildren = householdTax({ ...taxInputBase, dependentChildren: 0, childrenUnder3NoChildcare: 0, childcare }, tp);
    const childTaxBenefit = Math.max(0, taxNoChildren.total - tax.total);
    const taxNoQuotient = taxInputBase.couple ? householdTax({ ...taxInputBase, childcare, jointBenefits: false }, tp) : tax;
    const quotientGain = Math.max(0, taxNoQuotient.total - tax.total);
    const taxableTotal = tax.perPerson.reduce((sum, x) => sum + x.taxable, 0);
    const csssAmount = csss(taxableTotal, idx);

    lines.push({ key: 'ipp', label: 'Impôt des personnes physiques (État et taxe communale)', amount: -round(tax.total), group: 'impots', reliability: tp.reliability, source: tp.source, detail: `Quotient conjugal : ${round(tax.quotientTransfer)} € transférés (plafond ${tp.quotientCap} €), l'imposition commune (quotient conjugal et quotité exemptée inutilisée transférée) fait ${round(quotientGain / 12)} €/mois d'impôt en moins ; enfants à charge : ${dependents.length}, soit ${round(childTaxBenefit / 12)} €/mois d'impôt en moins, compté une seule fois quel que soit le parent qui les a sur sa fiche de paie ; réduction frais de garde : ${round(tax.childcareReduction)} € ; taxe communale ${(h.communalRate * 100).toFixed(1)} %` });
    lines.push({ key: 'csss', label: 'Cotisation spéciale de sécurité sociale', amount: -round(csssAmount), group: 'impots', reliability: 'approximation', detail: 'Barème du ménage appliqué au revenu imposable total.' });
    const crecheCost = childcare.reduce((sum, c) => sum + c.days * c.daily, 0);
    const crechePlanned = children.reduce((sum, c, i) => sum + (c.planned ? crecheDays[i] * daily : 0), 0);
    if (crecheCost > 0)
      lines.push({ key: 'creche', label: a.creche.type === 'one' ? 'Crèche (tarif ONE selon revenus)' : 'Crèche privée', amount: -round(crecheCost), group: 'couts', reliability: a.creche.type === 'one' ? 'approximation' : 'estime', source: a.creche.type === 'one' ? ONE_PFP_2026.source : undefined, detail: `${round(childcare.reduce((s2, c) => s2 + c.days, 0))} jours à ${daily.toFixed(2)} €/jour${a.creche.type === 'one' ? ` (revenu net du ménage ≈ ${round(netWorkMonthly)} €/mois${reduced ? ', tarif réduit' : ''})` : ''}` });

    // ---- Allocations familiales wallonnes ----
    const householdGross = perParent.reduce((sum, x) => sum + x.taxableGross, 0);
    let af = 0;
    let premium = 0;
    let oldSystemUsed = false;
    const soc = AF_WAL_2026.new.social;
    const socialLevel = householdGross <= soc.lowThreshold * idx ? 'low' : householdGross <= soc.highThreshold * idx ? 'mid' : 'none';
    const entitled = (mi: number) => children.filter((c) => {
      const age = ageInMonths(c, mi);
      return age >= 0 && age < a.allowanceEndAge * 12;
    });
    for (let m = 1; m <= 12; m++) {
      const mi = ymIndex(ym(year, m));
      const ent = entitled(mi);
      ent.forEach((c, rank) => {
        const age = Math.floor(ageInMonths(c, mi) / 12);
        if (ymIndex(c.birth) >= ymIndex('2020-01')) {
          let amt = age < 18 ? AF_WAL_2026.new.base0_17 : AF_WAL_2026.new.base18_24;
          if (socialLevel === 'low') amt += soc.low + (ent.length >= 3 ? soc.lowLarge : 0) + (isolated ? soc.lowSingle : 0);
          if (socialLevel === 'mid') amt += soc.mid + (ent.length >= 3 ? soc.midLarge : 0) + (isolated ? soc.midSingle : 0);
          af += amt * idx;
          if (m === 8) af += (AF_WAL_2026.new.school.find((x) => age <= x.maxAge)?.amount ?? 0) * idx;
        } else {
          oldSystemUsed = true;
          let amt = AF_WAL_2026.old.base[Math.min(rank, 2)];
          const ageSup = [...AF_WAL_2026.old.ageSupplement].reverse().find((x) => age >= x.minAge);
          if (ageSup) amt += ageSup.amount;
          if (socialLevel === 'low') amt += AF_WAL_2026.old.social[Math.min(rank, 2)];
          af += amt * idx;
          if (m === 8) af += (AF_WAL_2026.old.school.find((x) => age <= x.maxAge)?.amount ?? 0) * idx;
        }
      });
      for (const c of children) if (ymIndex(c.birth) === mi) premium += AF_WAL_2026.birthPremium * idx;
    }
    if (af > 0) lines.push({ key: 'af', label: 'Allocations familiales (Wallonie)', amount: round(af), group: 'allocations', reliability: year <= 2026 ? 'officiel' : 'projection', source: AF_WAL_2026.source, detail: `${socialLevel === 'none' ? 'Sans' : 'Avec'} supplément social (revenu brut du ménage ≈ ${round(householdGross)} €). Seuils publiés « 2024 », à confirmer.${oldSystemUsed ? ' Enfants nés avant 2020 : ancien système, suppléments d\'âge approximatifs.' : ''}` });
    if (premium > 0) lines.push({ key: 'prime', label: 'Prime de naissance', amount: round(premium), group: 'allocations', reliability: 'officiel', source: AF_WAL_2026.source });

    // ---- Coûts estimés de l'enfant ----
    const cm = a.childMonthly;
    let consumption = 0;
    let extracurricular = 0;
    let equipment = 0;
    let housing = 0;
    let plannedEstimated = 0;
    born.forEach((c, rank) => {
      const before = consumption + extracurricular + equipment + housing;
      const rf = rank === 0 ? 1 : rank === 1 ? a.rankFactor.second : a.rankFactor.thirdPlus;
      for (let m = 1; m <= 12; m++) {
        const mi = ymIndex(ym(year, m));
        const ageM = ageInMonths(c, mi);
        if (ageM < 0 || ageM >= 25 * 12) continue;
        const age = Math.floor(ageM / 12);
        const base = age <= 2 ? cm.age0_2 : age <= 5 ? cm.age3_5 : age <= 11 ? cm.age6_11 : age <= 17 ? cm.age12_17 : cm.age18_24;
        consumption += base * rf * idx;
        if (age >= 3 && age <= 12) {
          const home = minFraction(mi) === 0;
          if (!(a.extracurricularDropIfParentHome && home)) extracurricular += (a.extracurricularYearly / 12) * idx;
        }
        if (c.planned) housing += a.housingPerNewChildMonthly * idx;
      }
      if (ymIndex(c.birth) >= ymIndex(ym(year, 1)) && ymIndex(c.birth) <= dec) equipment += a.birthEquipment * idx;
      if (c.planned) plannedEstimated += consumption + extracurricular + equipment + housing - before;
    });
    const estimatedMid = consumption + extracurricular + equipment + housing;
    const estimatedCosts = { low: estimatedMid * a.costRange.low, mid: estimatedMid, high: estimatedMid * a.costRange.high };
    if (consumption > 0) lines.push({ key: 'conso', label: 'Alimentation, vêtements, santé, loisirs des enfants', amount: -round(consumption), group: 'couts', reliability: 'estime', detail: 'Hypothèse modifiable, varie fortement selon les ménages.' });
    if (extracurricular > 0) lines.push({ key: 'stages', label: 'Stages et garderies (3 à 12 ans)', amount: -round(extracurricular), group: 'couts', reliability: 'estime' });
    if (equipment > 0) lines.push({ key: 'equip', label: 'Équipement de naissance', amount: -round(equipment), group: 'couts', reliability: 'estime' });
    if (housing > 0) lines.push({ key: 'logement', label: 'Logement (chambre en plus)', amount: -round(housing), group: 'couts', reliability: 'estime' });

    // ---- Indicateurs ----
    const pensionLossYearly = perParent.reduce((sum, x) => sum + (x.unassimilated * PENSION.rate * Math.min(x.monthly * 13.92, PENSION.ceiling * idx)) / PENSION.careerYears, 0);

    const computedNet = lines.filter((l) => l.reliability !== 'estime').reduce((sum, l) => sum + l.amount, 0);
    // Salaire brut en entrée ; ONSS, impôt et crèche ONE en sortie : computedNet = revenu net du ménage après crèche ONE.
    const crecheEstimated = a.creche.type === 'prive' ? crecheCost : 0;
    const totalEstimated = { low: estimatedCosts.low + crecheEstimated, mid: estimatedCosts.mid + crecheEstimated, high: estimatedCosts.high + crecheEstimated };
    return {
      year,
      lines,
      computedNet: round(computedNet),
      estimatedCosts: { low: round(totalEstimated.low), mid: round(totalEstimated.mid), high: round(totalEstimated.high) },
      disposable: { low: round(computedNet - totalEstimated.high), mid: round(computedNet - totalEstimated.mid), high: round(computedNet - totalEstimated.low) },
      indicators: { pensionLossYearly: round(pensionLossYearly), notes, childTaxBenefit: round(childTaxBenefit), quotientGain: round(quotientGain) },
      parts: {
        crecheExisting: round(a.creche.type === 'one' ? crecheCost - crechePlanned : 0),
        crechePlanned: round(crechePlanned),
        plannedEstimated: round(plannedEstimated + (a.creche.type === 'prive' ? crechePlanned : 0)),
      },
    };
  },
};

export { SOURCES };

/**
 * Pension perdue (€/an, à vie), indicatif : chaque année-équivalent temps plein réduite ou arrêtée
 * sans allocation ONEM (donc non assimilée) jusqu'à 67 ans coûte environ 60 % du salaire plafonné / 45.
 * Ne tient pas compte du taux ménage (75 %), qui peut compenser en partie quand un conjoint a peu de pension.
 */
export function pensionLossUntilRetirement(h: Household, s: Situation, a: Assumptions): { A: number; B: number } {
  const out = { A: 0, B: 0 };
  for (const p of ['A', 'B'] as const) {
    const par = p === 'A' ? h.A : h.B;
    if (!par) continue;
    const lastYear = a.startYear + Math.max(0, 67 - par.age) - 1;
    for (let year = a.startYear; year <= lastYear; year++) {
      let unassimilated = 0;
      for (let m = 1; m <= 12; m++) {
        const r = regimeAt(s.periods, p, ymIndex(ym(year, m)));
        if (r.leave === 'aucun') unassimilated += (1 - r.fraction) / 12;
      }
      if (unassimilated === 0) continue;
      // Montants exprimés en euros d'aujourd'hui (salaire réel, sans indexation).
      const yearly = par.grossMonthlyFT * 13.92 * Math.pow(1 + a.realWageGrowth, year - a.startYear);
      out[p] += (unassimilated * PENSION.rate * Math.min(yearly, PENSION.ceiling)) / PENSION.careerYears;
    }
  }
  return { A: Math.round(out.A), B: Math.round(out.B) };
}
