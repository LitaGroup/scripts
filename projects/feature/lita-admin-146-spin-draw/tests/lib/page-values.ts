/**
 * 水果机数据页面文本解析工具（仅解析页面显示值，不访问接口/数据库）。
 */
export interface DetailSegment {
  raw: string;
  input: number | null;
  output: number | null;
  ratio: string;
}

export interface RoomEntry {
  raw: string;
  roomId: string;
  amountText: string;
  amount: number;
}

export function numberFrom(text: string): number {
  const match = text.replace(/[，\s]/g, '').match(/-?\d[\d,]*(?:\.\d+)?/);
  if (!match) return NaN;
  const value = Number(match[0].replace(/,/g, ''));
  return Number.isNaN(value) ? NaN : value;
}

export function fmtMoney(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function parseDetails(cell: string): { aladdin: DetailSegment | null; multiplier: DetailSegment | null; lampRaw: string | null } {
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(cell) as Record<string, unknown>;
  } catch {
    return { aladdin: null, multiplier: null, lampRaw: null };
  }
  const toSegment = (value: unknown): DetailSegment | null => {
    if (typeof value !== 'string') return null;
    const inputMatch = value.match(/input[：:]\s*([\d,，.\-]+)/);
    const outputMatch = value.match(/output[：:]\s*([\d,，.\-]+)/);
    const ratioMatch = value.match(/（([\d.]+)%）/);
    return {
      raw: value,
      input: inputMatch ? numberFrom(inputMatch[1]) : null,
      output: outputMatch ? numberFrom(outputMatch[1]) : null,
      ratio: ratioMatch ? `${ratioMatch[1]}%` : '',
    };
  };
  const lamp = json['Magic Lamp'];
  return {
    aladdin: toSegment(json['Aladdin']),
    multiplier: toSegment(json['Multiplier']),
    lampRaw: typeof lamp === 'string' ? lamp : null,
  };
}

export function parseRooms(cell: string): RoomEntry[] {
  const entries: RoomEntry[] = [];
  const regex = /ID=(\d+):\s*([\d,，.\-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(cell)) !== null) {
    entries.push({ raw: match[0], roomId: match[1], amountText: match[2], amount: numberFrom(match[2]) });
  }
  return entries;
}

export function percent(value: number): string {
  return `${value.toFixed(2)}%`;
}
