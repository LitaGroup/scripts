import { ServiceBase, type Env } from './ServiceBase.ts';

export interface RankRound {
  id: number;
  biz: string;
  topic: string;
  locale: string;
  key: string;
  startTime: number;
  finishTime: number;
  current: boolean;
  status: string;
}

export interface RankContributor {
  player: string;
  name: string;
}

export interface RankItem {
  player: string;
  no: number;
  name: string;
  amount: number;
  rank: number;
  playerType: string;
  contributors: RankContributor[];
  status: number;
}

export interface RankResult {
  round: RankRound;
  list: RankItem[];
}

export interface QueryRankOptions {
  userId?: string | number;
  timeoutMs?: number;
}

interface RankResponse {
  status: number;
  msg: string;
  data: {
    round?: RankRound;
    rankResult?: RankItem[];
  } | null;
}

export class RankService extends ServiceBase {
  constructor(env: Env) {
    super(env);
  }

  async queryRank(
    biz: string,
    topic: string,
    key: string,
    count: number,
    locale: string,
    options: QueryRankOptions = {},
  ): Promise<RankResult> {
    const path = `active/v3/${biz}/m/${topic}/rank`;
    const headers: Record<string, string> = { 'l-user-locale': locale };
    if (options.userId !== undefined) headers['l-user-id'] = String(options.userId);
    const res = await this.api.request(path, {
      method: 'POST',
      body: { key, count },
      headers,
      timeoutMs: options.timeoutMs,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`RankService: POST ${path} HTTP ${res.status} ${res.statusText}. Response: ${text}`);
    }
    const result = (await res.json()) as RankResponse;
    if (result.status !== 0) {
      throw new Error(`RankService: query ${biz}/${topic}/${locale} failed (status=${result.status}): ${result.msg}`);
    }
    if (!result.data?.round || !result.data?.rankResult) {
      throw new Error(`RankService: no rank data for biz=${biz} topic=${topic} key=${key} locale=${locale}`);
    }
    const list: RankItem[] = result.data.rankResult.map((r) => ({
      player: String(r.player),
      no: Number(r.no),
      name: String(r.name ?? ''),
      amount: Number(r.amount ?? 0),
      rank: Number(r.rank),
      playerType: String(r.playerType ?? ''),
      contributors: Array.isArray(r.contributors)
        ? r.contributors.map((c) => ({ player: String(c.player), name: String(c.name ?? '') }))
        : [],
      status: Number(r.status ?? 0),
    }));
    return { round: result.data.round, list };
  }
}
