import type { APITestResource } from '../resources/APITestResource.ts';
import type { MySQLTestResource, MysqlRow } from '../resources/MySQLTestResource.ts';

export interface GameGradeServiceDeps {
  api: APITestResource;
  mysql: MySQLTestResource;
}

const API_BASE = 'active-main/v1/gameGrade';
const DB_BASIC = 'lita_basic';
const DB_ACTIVE = 'lita_active';

export interface GameGradeDef {
  name: string;
  type: string;
  experienceLimit: number;
  experienceTier: number;
  starLevel: number;
  nextSeasonGrade: string | null;
  mainGrade: string | null;
}

export interface EggwarRoundRow {
  id: number;
  biz: string;
  topic: string;
  round: string;
  status: number;
  start_time: number;
  end_time: number;
}

function quoteStr(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}

function quoteNum(n: number | string): string {
  const str = String(n);
  if (!/^-?\d+$/.test(str)) {
    throw new Error(`GameGradeService: invalid numeric value: ${n}`);
  }
  return str;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

/**
 * 游戏荣耀等级（game-grade）业务服务，绑定测试环境资源。
 * 接口前缀 active-main/v1/gameGrade；等级/鸡蛋数据在 lita_basic、lita_active（测试环境直连读写）。
 * 时间模拟依赖 l-debug-timestamp（格式 yyyy-MM-ddTHH:mm:ss±HH:mm，不支持毫秒）。
 */
export class GameGradeService {
  readonly api: APITestResource;
  readonly mysql: MySQLTestResource;

  constructor(deps: GameGradeServiceDeps) {
    this.api = deps.api;
    this.mysql = deps.mysql;
  }

  // ==================== HTTP 接口 ====================

  /** 当前生效配置的 pipeline/module 定义（环境自省） */
  async doc(): Promise<Record<string, unknown>> {
    const data = await this.api.request(`${API_BASE}/doc`, { method: 'GET' });
    return asRecord(data);
  }

  /** 游戏中心入口（内部走 GET，会触发懒切换；需带 locale，否则返回空对象） */
  async entrance(userId: number | string, locale: string, debugTs: string): Promise<Record<string, unknown>> {
    const data = await this.api.request(`${API_BASE}/entrance`, { body: {}, userId, locale, debugTimestamp: debugTs });
    return asRecord(data);
  }

  /** 等级查询（会触发懒切换） */
  async gradeGet(userId: number | string, locale: string, debugTs: string): Promise<Record<string, unknown>> {
    const data = await this.api.request(`${API_BASE}/mod/user-game-grade/GET`, { body: {}, userId, locale, debugTimestamp: debugTs });
    return asRecord(data);
  }

  /** 等级面板（会触发懒切换） */
  async gradePanel(userId: number | string, locale: string, debugTs: string): Promise<Record<string, unknown>> {
    const data = await this.api.request(`${API_BASE}/mod/user-game-grade/PANEL`, { body: {}, userId, locale, debugTimestamp: debugTs });
    return asRecord(data);
  }

  /** 经验变更（Kafka 同构；时间窗外不处理返回 null） */
  async gradeUpdate(userId: number | string, params: { causeBiz: string; transNo: string; amount: number; type?: string }, debugTs: string): Promise<Record<string, unknown>> {
    const data = await this.api.request(`${API_BASE}/mod/user-game-grade/UPDATE`, {
      body: { userId, causeBiz: params.causeBiz, transNo: params.transNo, type: params.type ?? 'ADD_MONEY', amount: params.amount },
      userId,
      debugTimestamp: debugTs,
    });
    return asRecord(data);
  }

  /** 游戏流水补数入口（与 Kafka funbit.user_deal_account_log.new-game-user 消息体同构） */
  async handleUserDealAccountLog(message: Record<string, unknown>, debugTs: string): Promise<unknown> {
    return this.api.request(`${API_BASE}/handleUserDealAccountLog2`, { body: message, debugTimestamp: debugTs });
  }

  /** 直调 user-deal-account.update pipeline（consumer 同链路，只传 user-game-grade 模块参数） */
  async userDealPipeline(userGameGrade: { userId: number | string; causeBiz: string; transNo: string; amount: number; type?: string }, debugTs: string): Promise<Record<string, unknown>> {
    const data = await this.api.request(`${API_BASE}/event/user-deal-account.update`, {
      body: { 'user-game-grade': { userId: userGameGrade.userId, causeBiz: userGameGrade.causeBiz, transNo: userGameGrade.transNo, type: userGameGrade.type ?? 'ADD_MONEY', amount: userGameGrade.amount } },
      userId: userGameGrade.userId,
      debugTimestamp: debugTs,
    });
    return asRecord(data);
  }

  /** 鸡蛋结算+开新轮（topic: daily | weekly） */
  async settle(topic: 'daily' | 'weekly', debugTs: string, force = false): Promise<unknown> {
    const key = `egg-war-${topic}`;
    return this.api.request(`${API_BASE}/event/${key}.settle`, { body: { [key]: { force } }, debugTimestamp: debugTs });
  }

  /** 鸡蛋轮次面板 */
  async eggwarPanel(topic: 'daily' | 'weekly', userId: number | string, locale: string, debugTs: string): Promise<Record<string, unknown>> {
    const data = await this.api.request(`${API_BASE}/mod/egg-war-${topic}/PANEL`, { body: {}, userId, locale, debugTimestamp: debugTs });
    return asRecord(data);
  }

  // ==================== MySQL 查询（lita_basic：等级三件套 + 奖励 + 等级定义） ====================

  /** 全量等级定义（biz=game_grade_default，含 next_season_grade 衰减映射） */
  async gradeDefs(): Promise<GameGradeDef[]> {
    const rows = await this.mysql.query(
      `SELECT name, type, experience_limit, experience_tier, star_level, next_season_grade, main_grade
       FROM game_grade WHERE biz='game_grade_default' ORDER BY experience_limit, id`,
      DB_BASIC,
    );
    return rows.map((r) => ({
      name: String(r['name']),
      type: String(r['type']),
      experienceLimit: Number(r['experience_limit']),
      experienceTier: Number(r['experience_tier']),
      starLevel: Number(r['star_level']),
      nextSeasonGrade: r['next_season_grade'] === null || r['next_season_grade'] === undefined ? null : String(r['next_season_grade']),
      mainGrade: r['main_grade'] === null || r['main_grade'] === undefined ? null : String(r['main_grade']),
    }));
  }

  /** 按等级名取定义 */
  async gradeDefOf(name: string): Promise<GameGradeDef | null> {
    const defs = await this.gradeDefs();
    return defs.find((d) => d.name === name) ?? null;
  }

  async userGradeRow(userId: number | string, biz: string): Promise<MysqlRow | null> {
    const rows = await this.mysql.query(
      `SELECT * FROM user_game_grade WHERE user_id=${quoteNum(userId)} AND biz=${quoteStr(biz)}`,
      DB_BASIC,
    );
    return rows[0] ?? null;
  }

  async userGradeLogs(userId: number | string, biz: string): Promise<MysqlRow[]> {
    return this.mysql.query(
      `SELECT * FROM user_game_grade_log WHERE user_id=${quoteNum(userId)} AND biz=${quoteStr(biz)} ORDER BY id`,
      DB_BASIC,
    );
  }

  async userGradeExperiences(userId: number | string, biz: string): Promise<MysqlRow[]> {
    return this.mysql.query(
      `SELECT * FROM user_game_grade_experience WHERE user_id=${quoteNum(userId)} AND biz=${quoteStr(biz)} ORDER BY id`,
      DB_BASIC,
    );
  }

  async userGradeAwards(userId: number | string, biz: string): Promise<MysqlRow[]> {
    return this.mysql.query(
      `SELECT * FROM user_game_grade_award WHERE user_id=${quoteNum(userId)} AND biz=${quoteStr(biz)} ORDER BY id`,
      DB_BASIC,
    );
  }

  /** 造上赛季等级行（biz 形如 game_grade_202608，season 取 biz 尾部数字） */
  async seedUserGrade(biz: string, userId: number | string, grade: string, experience: number): Promise<void> {
    const m = /(\d{6})$/.exec(biz);
    if (!m) throw new Error(`GameGradeService: 无法从 biz 推导 season: ${biz}`);
    const now = Date.now();
    await this.mysql.execute(
      `INSERT INTO user_game_grade (biz, topic, user_id, experience, grade, grade_level, is_show, create_time, update_time, season)
       VALUES (${quoteStr(biz)}, '-', ${quoteNum(userId)}, ${quoteNum(experience)}, ${quoteStr(grade)}, 0, 1, ${quoteNum(now)}, ${quoteNum(now)}, ${quoteNum(m[1])})`,
      DB_BASIC,
    );
  }

  /** 清理用户在指定 biz 集合下的等级数据（三件套+奖励） */
  async cleanUserGradeData(userId: number | string, bizs: string[]): Promise<void> {
    for (const biz of bizs) {
      const tables = ['user_game_grade', 'user_game_grade_log', 'user_game_grade_experience', 'user_game_grade_award'];
      for (const t of tables) {
        await this.mysql.execute(`DELETE FROM ${t} WHERE user_id=${quoteNum(userId)} AND biz=${quoteStr(biz)}`, DB_BASIC);
      }
    }
  }

  // ==================== MySQL 查询/造数（lita_active：鸡蛋大战轮次） ====================

  async eggwarRounds(biz: string, topic?: string): Promise<EggwarRoundRow[]> {
    const conds = [`biz=${quoteStr(biz)}`];
    if (topic) conds.push(`topic=${quoteStr(topic)}`);
    const rows = await this.mysql.query(`SELECT * FROM mod_eggwar_round WHERE ${conds.join(' AND ')} ORDER BY id`, DB_ACTIVE);
    return rows as unknown as EggwarRoundRow[];
  }

  async eggwarUserRounds(topic: string, round: string): Promise<MysqlRow[]> {
    return this.mysql.query(
      `SELECT * FROM mod_eggwar_user_round WHERE topic=${quoteStr(topic)} AND round=${quoteStr(round)} ORDER BY id`,
      DB_ACTIVE,
    );
  }

  async seedEggwarRound(biz: string, topic: string, round: string, status: number, startMs: number, endMs: number): Promise<void> {
    await this.mysql.execute(
      `INSERT INTO mod_eggwar_round (biz, topic, round, status, start_time, end_time, create_time)
       VALUES (${quoteStr(biz)}, ${quoteStr(topic)}, ${quoteStr(round)}, ${quoteNum(status)}, ${quoteNum(startMs)}, ${quoteNum(endMs)}, ${quoteNum(Date.now())})`,
      DB_ACTIVE,
    );
  }

  async seedEggwarUserRound(biz: string, topic: string, round: string, userId: number | string, value: number, createTime: number): Promise<void> {
    await this.mysql.execute(
      `INSERT INTO mod_eggwar_user_round (biz, topic, round, user_id, value, create_time)
       VALUES (${quoteStr(biz)}, ${quoteStr(topic)}, ${quoteStr(round)}, ${quoteNum(userId)}, ${quoteNum(value)}, ${quoteNum(createTime)})`,
      DB_ACTIVE,
    );
  }

  /** 按 round 名清理轮次与参与记录（测试造数/副产物清理） */
  async cleanEggwarRounds(rounds: string[]): Promise<void> {
    for (const round of rounds) {
      await this.mysql.execute(`DELETE FROM mod_eggwar_user_round WHERE round=${quoteStr(round)}`, DB_ACTIVE);
      await this.mysql.execute(`DELETE FROM mod_eggwar_round WHERE round=${quoteStr(round)}`, DB_ACTIVE);
    }
  }
}
