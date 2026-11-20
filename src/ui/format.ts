export const eur = (v: number, sign = false) => (sign && v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(Math.round(v)).toLocaleString('fr-BE') + ' €';
export const pct = (v: number) => `${Math.round(v * 100)} %`;
export const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-');
  return `${['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'][Number(m) - 1]} ${y}`;
};
export const uid = () => Math.random().toString(36).slice(2, 9);
