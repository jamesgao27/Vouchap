// 单一税季配色表：所有 Tax Filing / Engagement 列表与详情统一从这里取色
const TAX_SEASON_COLORS = [
  '#6C5CE7', // 0
  '#E17055', // 1
  '#00B894', // 2
  '#0984E3', // 3
  '#FDCB6E', // 4
  '#E84393', // 5
  '#00CEC9', // 6
  '#74B9FF', // 7
  '#A29BFE', // 8
  '#FD79A8', // 9
];

export function getTaxSeasonColor(year: number | null | undefined): string {
  if (year == null || Number.isNaN(year)) {
    return TAX_SEASON_COLORS[0];
  }
  const idx = Math.abs(Math.trunc(year)) % TAX_SEASON_COLORS.length;
  return TAX_SEASON_COLORS[idx] ?? TAX_SEASON_COLORS[0];
}

