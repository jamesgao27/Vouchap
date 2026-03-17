// 单一税季配色表：所有 Tax Filing / Engagement 列表与详情统一从这里取色
const TAX_SEASON_COLORS = [
  '#6C5CE7', // 0 – purple
  '#E17055', // 1 – orange
  '#00B894', // 2 – green
  '#0984E3', // 3 – blue
  '#FDCB6E', // 4 – yellow
  '#E84393', // 5 – pink
  '#00CEC9', // 6 – teal
  '#74B9FF', // 7 – light blue
  '#A29BFE', // 8 – light purple
  '#FD79A8', // 9 – light pink
];

// 与 TAX_SEASON_COLORS 一一对应的浅色底色（同色系更浅，用于浅底色深字色样式）
const TAX_SEASON_BG_COLORS = [
  '#F0ECFF', // 0 – soft purple
  '#FFE5D6', // 1 – soft orange
  '#E3FCEF', // 2 – soft green
  '#E1F0FF', // 3 – soft blue
  '#FFF6DC', // 4 – soft yellow
  '#FFE4F0', // 5 – soft pink
  '#E0FBFA', // 6 – soft teal
  '#E5F2FF', // 7 – soft light blue
  '#ECE8FF', // 8 – soft light purple
  '#FFE5F1', // 9 – soft light pink
];

export function getTaxSeasonColor(year: number | null | undefined): string {
  if (year == null || Number.isNaN(year)) {
    return TAX_SEASON_COLORS[0];
  }
  const idx = Math.abs(Math.trunc(year)) % TAX_SEASON_COLORS.length;
  return TAX_SEASON_COLORS[idx] ?? TAX_SEASON_COLORS[0];
}

export function getTaxSeasonBgColor(year: number | null | undefined): string {
  if (year == null || Number.isNaN(year)) {
    return TAX_SEASON_BG_COLORS[0];
  }
  const idx = Math.abs(Math.trunc(year)) % TAX_SEASON_BG_COLORS.length;
  return TAX_SEASON_BG_COLORS[idx] ?? TAX_SEASON_BG_COLORS[0];
}


