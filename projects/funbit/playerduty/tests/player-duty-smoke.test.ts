import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { TestBaseClass } from '../../../../src/base/TestBaseClass.ts';
import {
  type DutyCalendar,
  type DutyEntry,
  type DutyRequestItem,
  type DutyResult,
  type DutyShift,
  type DutySlot,
} from '../../../../src/services/PlayerDutyService.ts';

/**
 * 陪玩师值班日历客户端冒烟（测试环境）
 * 设计：https://project.cinta.team/api/documents/120.md
 * 接口：https://project.cinta.team/api/documents/121.md
 *
 * 覆盖：入口信息、周/月视图、七种卡片状态、新增/修改/取消申请、24h/下周日/固定班次/
 *      冲突/重复申请校验、近 30 天申请记录与超时自动拒绝、非陪玩师拦截。
 *
 * 运行：node player-duty-smoke.test.ts [--user-id=40] [--locale=in]
 *        [--timezone=Asia/Jakarta] [--non-player-id=xxx] [--keep-data]
 * 前置：config.json（测试环境 funbit / lita_basic 直连）；测试账号需为陪玩师。
 */

const FIXED_SLOTS: DutySlot[] = [
  { key: '11-13', startTime: '11:00', endTime: '13:00' },
  { key: '13-15', startTime: '13:00', endTime: '15:00' },
  { key: '15-17', startTime: '15:00', endTime: '17:00' },
  { key: '17-19', startTime: '17:00', endTime: '19:00' },
  { key: '19-21', startTime: '19:00', endTime: '21:00' },
  { key: '21-23', startTime: '21:00', endTime: '23:00' },
];

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

function arg(name: string, def: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : def;
}

const USER_ID_ARG = arg('user-id', '40');
const NON_PLAYER_ID_ARG = arg('non-player-id', '');
const LOCALE = arg('locale', 'in').toLowerCase().split('-')[0];
const TIMEZONE = arg('timezone', 'Asia/Jakarta');
const KEEP_DATA = process.argv.includes('--keep-data');
const REMARK_PREFIX = 'player-duty-smoke-';

interface CalendarParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

interface SeededDuty {
  id: number;
  date: string;
  dateInt: number;
  startTime: number;
  endTime: number;
  startAt: number;
  endAt: number;
  result: string | null;
  slotKey: string | null;
}

interface TargetSlot {
  date: string;
  dateInt: number;
  slotKey: string;
  startTime: number;
  endTime: number;
  startAt: number;
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsAt(ms: number, timeZone: string): CalendarParts {
  let fmt = partsFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    partsFormatters.set(timeZone, fmt);
  }
  const map = new Map<string, string>();
  for (const p of fmt.formatToParts(new Date(ms))) {
    if (p.type !== 'literal') map.set(p.type, p.value);
  }
  return {
    year: Number(map.get('year')),
    month: Number(map.get('month')),
    day: Number(map.get('day')),
    hour: Number(map.get('hour')),
    minute: Number(map.get('minute')),
    second: Number(map.get('second')),
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function dateOf(ms: number, timeZone: string): string {
  const p = partsAt(ms, timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function nextNaturalWeekSunday(today: string): string {
  const monday = addDays(today, -((dayOfWeek(today) + 6) % 7));
  return addDays(monday, 13);
}

function mondayOfWeek(today: string): string {
  return addDays(today, -((dayOfWeek(today) + 6) % 7));
}

function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function addMonths(month: string, offset: number): string {
  const [y, m] = month.split('-').map(Number);
  const total = y * 12 + (m - 1) + offset;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${pad2(nm)}`;
}

function monthDiff(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (ay - by) * 12 + (am - bm);
}

function dateToInt(date: string): number {
  return Number(date.replace(/-/g, ''));
}

function hhmmToInt(value: string): number {
  return Number(value.replace(':', ''));
}

function intToHhmm(value: number): string {
  return `${pad2(Math.floor(value / 100))}:${pad2(value % 100)}`;
}

function minutesToHhmm(minutes: number): number {
  return Math.floor(minutes / 60) * 100 + (minutes % 60);
}

function tzOffsetMs(ms: number, timeZone: string): number {
  const p = partsAt(ms, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - ms;
}

function epochOf(date: string, time: number, timeZone: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, Math.floor(time / 100), time % 100, 0);
  let ts = guess - tzOffsetMs(guess, timeZone);
  ts = guess - tzOffsetMs(ts, timeZone);
  return ts;
}

function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function must<T>(r: DutyResult<T>, label: string): T {
  if (!r.ok) throw new Error(`${label}: ${r.state || r.status} ${r.message}`.trim());
  return r.content;
}

function errText(r: DutyResult<unknown>): string {
  return r.ok ? 'OK' : r.state || `HTTP_${r.status}`;
}

function shiftText(s: DutyShift | undefined): string {
  if (!s) return '未找到卡片';
  const pending = s.pendingRequest ? ` pending=${s.pendingRequest.type}/${s.pendingRequest.status}` : '';
  return `state=${s.state} result=${s.result ?? 'null'} modify=${s.canModify} cancel=${s.canCancel}${pending}`;
}

class PlayerDutySmoke extends TestBaseClass {
  private userId = 0;
  private locale = LOCALE;
  private zone = TIMEZONE;
  private setupError = '';
  private cleaned = false;
  private entry!: DutyEntry;
  private today = '';
  private maxApplyDate = '';
  private duties = new Map<string, SeededDuty>();
  private weekShifts = new Map<number, DutyShift>();
  private requestIds: number[] = [];
  private dutyIds: number[] = [];
  private addTarget: TargetSlot | null = null;
  private addRequestId = 0;
  private modifyTarget: TargetSlot | null = null;
  private modifyRequestId = 0;
  private cancelRequestId = 0;
  private conflictDuty: SeededDuty | null = null;
  private timeoutRequestId = 0;
  private month0: DutyResult<DutyCalendar> | null = null;
  private monthPrev: DutyResult<DutyCalendar> | null = null;
  private nonPlayerId = 0;
  private nonPlayerEntry: DutyResult<DutyEntry> | null = null;
  private nonPlayerCalendar: DutyResult<DutyCalendar> | null = null;
  private nonPlayerAdd: DutyResult<unknown> | null = null;

  constructor() {
    super();
    this.total = 49;
  }

  private get pd() {
    return this.playerDuty;
  }

  async execute(): Promise<void> {
    try {
      await super.execute();
    } finally {
      await this.cleanupSilently();
    }
  }

  private guard(): void {
    if (this.setupError) this.skip(`初始化失败：${this.setupError}`);
  }

  private async actG(title: string, fn: () => unknown | Promise<unknown>): Promise<void> {
    await this.act(title, async () => {
      this.guard();
      await fn();
    });
  }

  private async checkG(title: string, fn: () => CheckResult | Promise<CheckResult>): Promise<void> {
    await this.check(title, async () => {
      this.guard();
      return fn();
    });
  }

  private async cleanupSilently(): Promise<void> {
    if (this.cleaned || KEEP_DATA || this.userId === 0) return;
    try {
      await this.pd.deleteRequestIds(this.requestIds);
      await this.pd.deleteDutyIds(this.dutyIds);
      await this.pd.deleteRequestsByRemarkPrefix(this.locale, this.userId, REMARK_PREFIX);
      this.cleaned = true;
    } catch {
      // ignore
    }
  }

  private async seedAt(
    name: string,
    date: string,
    startTime: number,
    endTime: number,
    result: string | null,
    slotKey: string | null = null,
  ): Promise<SeededDuty> {
    const dateInt = dateToInt(date);
    await this.pd.deleteDutyByKey(this.locale, this.userId, dateInt, startTime);
    const startAt = epochOf(date, startTime, this.zone);
    const endAt = epochOf(date, endTime, this.zone);
    const { id, inserted } = await this.pd.insertDuty({
      locale: this.locale,
      playerId: this.userId,
      dutyDate: dateInt,
      startTime,
      endTime,
      startAt,
      endAt,
      result,
      attendance: null,
    });
    if (!inserted) throw new Error(`造数冲突：值班已存在 ${date} ${intToHhmm(startTime)}`);
    this.dutyIds.push(id);
    const duty: SeededDuty = { id, date, dateInt, startTime, endTime, startAt, endAt, result, slotKey };
    this.duties.set(name, duty);
    return duty;
  }

  private async loadWeekShifts(): Promise<Map<number, DutyShift>> {
    const shifts = new Map<number, DutyShift>();
    for (const offset of [-1, 0, 1]) {
      const cal = must(await this.pd.calendar(this.userId, 'WEEK', offset), `calendar WEEK ${offset}`);
      for (const day of cal.days) {
        for (const shift of day.shifts) shifts.set(shift.dutyId, shift);
      }
    }
    return shifts;
  }

  private async findFreeTarget(exclude: Set<string> = new Set()): Promise<TargetSlot> {
    const pending = await this.pd.queryPendingRequests(this.locale, this.userId);
    const earliest = addDays(this.today, 2);
    let date = this.maxApplyDate;
    for (let i = 0; i < 14 && date >= earliest; i++) {
      const dateInt = dateToInt(date);
      const duties = await this.pd.queryDutiesForDate(this.locale, this.userId, dateInt);
      for (const slot of this.entry.slots) {
        const key = `${date}|${slot.key}`;
        if (exclude.has(key)) continue;
        const startTime = hhmmToInt(slot.startTime);
        const endTime = hhmmToInt(slot.endTime);
        const startAt = epochOf(date, startTime, this.zone);
        if (startAt <= this.entry.minApplyAt) continue;
        const dutyConflict = duties.some((d) =>
          overlap(startTime, endTime, Number(d['start_time']), Number(d['end_time'])),
        );
        if (dutyConflict) continue;
        const requestConflict = pending.some((p) => {
          if (Number(p['target_date']) !== dateInt || p['target_start_time'] === null) return false;
          return overlap(
            startTime,
            endTime,
            Number(p['target_start_time']),
            Number(p['target_end_time']),
          );
        });
        if (requestConflict) continue;
        return { date, dateInt, slotKey: slot.key, startTime, endTime, startAt };
      }
      date = addDays(date, -1);
    }
    throw new Error(`在 ${earliest} ~ ${this.maxApplyDate} 内未找到可用目标时段`);
  }

  protected async run(): Promise<void> {
    await this.act('初始化：定位测试陪玩师并校验接口可用', async () => {
      try {
        const candidates = USER_ID_ARG
          ? [Number(USER_ID_ARG)]
          : await this.pd.findPlayerIds(this.locale, 20);
        if (candidates.length === 0) {
          throw new Error(`大区 ${this.locale} 未找到陪玩师账号，可用 --user-id 指定`);
        }
        let last = '';
        for (const id of candidates.slice(0, 5)) {
          const r = await this.pd.entry(id);
          if (!r.ok) {
            last = `${r.state || r.status} ${r.message}`;
            continue;
          }
          if (!r.content.isPlayer) {
            last = 'isPlayer=false';
            continue;
          }
          this.userId = id;
          this.entry = r.content;
          break;
        }
        if (this.userId === 0) {
          throw new Error(`未找到可用的陪玩师账号（${last || '无候选'}），可用 --user-id 指定`);
        }
        const loc = await this.pd.localeOf(this.userId);
        if (loc) this.locale = loc.toLowerCase().split('-')[0];
        this.log(`用户=${this.userId} 大区=${this.locale} 时区=${this.zone}`);
      } catch (e) {
        this.setupError = (e as Error).message;
        throw e;
      }
    });

    await this.actG('清理历史冒烟申请记录', async () => {
      await this.pd.deleteRequestsByRemarkPrefix(this.locale, this.userId, REMARK_PREFIX);
    });

    await this.actG('造数：七种卡片状态 + 超时申请', async () => {
      const now = Date.now();
      this.today = dateOf(now, this.zone);
      this.maxApplyDate = nextNaturalWeekSunday(this.today);
      const slots = new Map(this.entry.slots.map((s) => [s.key, s]));

      const pastDate = addDays(this.today, -2);
      await this.seedAt('pastComplete', pastDate, 1, 2, 'COMPLETE');
      await this.seedAt('pastIncomplete', pastDate, 3, 4, 'INCOMPLETE');
      await this.seedAt('pastConfirming', pastDate, 5, 6, null);

      const p = partsAt(now, this.zone);
      const nowMinute = p.hour * 60 + p.minute;
      if (nowMinute < 1439) {
        const startMinute = Math.max(0, nowMinute - 60);
        const endMinute = Math.min(1439, nowMinute + 60);
        await this.seedAt('onDuty', this.today, minutesToHhmm(startMinute), minutesToHhmm(endMinute), 'COMPLETE');
      } else {
        this.log('当前处于 23:59，跳过 ON_DUTY 造数');
      }

      const lockMs = now + 2 * HOUR_MS;
      const lockParts = partsAt(lockMs, this.zone);
      let lockStartMinute = lockParts.hour * 60 + lockParts.minute;
      let lockEndMinute = lockStartMinute + 60;
      if (lockEndMinute > 1439) {
        lockStartMinute = Math.min(lockStartMinute, 1438);
        lockEndMinute = 1439;
      }
      await this.seedAt(
        'locked',
        dateOf(lockMs, this.zone),
        minutesToHhmm(lockStartMinute),
        minutesToHhmm(lockEndMinute),
        null,
      );

      await this.seedAt('editable1', addDays(this.today, 3), 11, 12, null);
      await this.seedAt('editable2', addDays(this.today, 4), 13, 14, null);

      conflictLoop: for (let offset = 2; offset <= 14; offset++) {
        const date = addDays(this.today, offset);
        if (date > this.maxApplyDate) break;
        const dateInt = dateToInt(date);
        for (const key of ['11-13', '13-15', '15-17', '17-19', '19-21', '21-23']) {
          const slot = slots.get(key);
          if (!slot) continue;
          const startTime = hhmmToInt(slot.startTime);
          const endTime = hhmmToInt(slot.endTime);
          const startAt = epochOf(date, startTime, this.zone);
          if (startAt <= this.entry.minApplyAt) continue;
          const { id, inserted } = await this.pd.insertDuty({
            locale: this.locale,
            playerId: this.userId,
            dutyDate: dateInt,
            startTime,
            endTime,
            startAt,
            endAt: epochOf(date, endTime, this.zone),
            result: null,
            attendance: null,
          });
          if (!inserted) continue;
          this.dutyIds.push(id);
          this.conflictDuty = {
            id,
            date,
            dateInt,
            startTime,
            endTime,
            startAt,
            endAt: epochOf(date, endTime, this.zone),
            result: null,
            slotKey: key,
          };
          break conflictLoop;
        }
      }

      this.timeoutRequestId = await this.pd.insertPendingRequest({
        locale: this.locale,
        playerId: this.userId,
        requestType: 'ADD',
        targetDate: dateToInt(addDays(this.today, -1)),
        targetStartTime: 7,
        targetEndTime: 8,
        deadlineAt: now - 5 * 60_000,
        applyAt: now - 2 * HOUR_MS,
        remark: `${REMARK_PREFIX}${now}`,
      });
      this.requestIds.push(this.timeoutRequestId);

      this.log(
        `已造数：值班=${this.dutyIds.length} 条，冲突值班=${this.conflictDuty?.id ?? '无'}，超时申请=${this.timeoutRequestId}`,
      );
    });

    await this.actG('读取入口信息（造数后）', async () => {
      this.entry = must(await this.pd.entry(this.userId), 'entry');
    });

    await this.checkG('入口 isPlayer=true', async (): Promise<CheckResult> => {
      return { expect: 'true', real: String(this.entry.isPlayer), pass: this.entry.isPlayer };
    });

    await this.checkG('有排班记录时入口 visible=true', async (): Promise<CheckResult> => {
      return { expect: 'true', real: String(this.entry.visible), pass: this.entry.visible };
    });

    await this.checkG('serverNow 与本地时间偏差不超过 60 秒', async (): Promise<CheckResult> => {
      const delta = Math.abs(this.entry.serverNow - Date.now());
      return { expect: '<=60000ms', real: `${delta}ms`, pass: delta <= 60_000 };
    });

    await this.checkG('minApplyAt = serverNow + 24h', async (): Promise<CheckResult> => {
      const expect = this.entry.serverNow + 24 * HOUR_MS;
      const delta = Math.abs(this.entry.minApplyAt - expect);
      return { expect: String(expect), real: `${this.entry.minApplyAt} (差 ${delta}ms)`, pass: delta <= 1000 };
    });

    await this.checkG('maxApplyDate = 下一个自然周的周日', async (): Promise<CheckResult> => {
      const expect = nextNaturalWeekSunday(this.today);
      return { expect, real: this.entry.maxApplyDate };
    });

    await this.checkG('minMonth 为 yyyy-MM 格式', async (): Promise<CheckResult> => {
      const ok = /^\d{4}-\d{2}$/.test(this.entry.minMonth);
      return { expect: 'yyyy-MM', real: this.entry.minMonth, pass: ok };
    });

    await this.checkG('固定班次 6 个且时间正确', async (): Promise<CheckResult> => {
      const expect = JSON.stringify(FIXED_SLOTS);
      const real = JSON.stringify(this.entry.slots);
      return { expect, real, pass: expect === real };
    });

    await this.actG('读取周视图（上周/本周/下周）', async () => {
      this.weekShifts = await this.loadWeekShifts();
    });

    await this.checkG('本周视图返回周一到周日 7 天且 today 正确', async (): Promise<CheckResult> => {
      const cal = must(await this.pd.calendar(this.userId, 'WEEK', 0), 'calendar WEEK 0');
      const start = mondayOfWeek(this.today);
      const end = addDays(start, 6);
      const todayDays = cal.days.filter((d) => d.isToday).length;
      const pass =
        cal.view === 'WEEK' &&
        cal.offset === 0 &&
        cal.startDate === start &&
        cal.endDate === end &&
        cal.today === this.today &&
        cal.days.length === 7 &&
        todayDays === 1;
      return {
        expect: `${start}~${end} 7天 today=${this.today}`,
        real: `${cal.startDate}~${cal.endDate} ${cal.days.length}天 today=${cal.today} isToday数=${todayDays}`,
        pass,
      };
    });

    await this.checkG('周视图 offset=-1/+1 各偏移 7 天', async (): Promise<CheckResult> => {
      const base = must(await this.pd.calendar(this.userId, 'WEEK', 0), 'calendar WEEK 0');
      const prev = must(await this.pd.calendar(this.userId, 'WEEK', -1), 'calendar WEEK -1');
      const next = must(await this.pd.calendar(this.userId, 'WEEK', 1), 'calendar WEEK 1');
      const pass =
        prev.startDate === addDays(base.startDate, -7) &&
        prev.endDate === addDays(base.endDate, -7) &&
        next.startDate === addDays(base.startDate, 7) &&
        next.endDate === addDays(base.endDate, 7);
      return {
        expect: `-7/+7 天`,
        real: `prev=${prev.startDate}~${prev.endDate} next=${next.startDate}~${next.endDate}`,
        pass,
      };
    });

    await this.checkG('历史卡片三态：COMPLETED/INCOMPLETE/CONFIRMING', async (): Promise<CheckResult> => {
      const cases: Array<[string, string, string | null]> = [
        ['pastComplete', 'COMPLETED', 'COMPLETE'],
        ['pastIncomplete', 'INCOMPLETE', 'INCOMPLETE'],
        ['pastConfirming', 'CONFIRMING', null],
      ];
      const details: string[] = [];
      let pass = true;
      for (const [key, state, result] of cases) {
        const duty = this.duties.get(key)!;
        const shift = this.weekShifts.get(duty.id);
        const ok = shift?.state === state && (shift.result ?? null) === result;
        pass &&= ok;
        details.push(`${key}: ${shiftText(shift)}`);
      }
      return { expect: '三种历史状态', real: details.join('; '), pass };
    });

    await this.checkG('进行中卡片 ON_DUTY（result 不参与判断）', async (): Promise<CheckResult> => {
      const duty = this.duties.get('onDuty');
      if (!duty) this.skip('23:59 边界，跳过 ON_DUTY 校验');
      const shift = this.weekShifts.get(duty!.id);
      const pass = shift?.state === 'ON_DUTY' && shift.result === 'COMPLETE';
      return { expect: 'ON_DUTY result=COMPLETE', real: shiftText(shift), pass };
    });

    await this.checkG('24 小时内未开始卡片 NOT_STARTED_LOCKED', async (): Promise<CheckResult> => {
      const duty = this.duties.get('locked')!;
      const shift = this.weekShifts.get(duty.id);
      const pass =
        shift?.state === 'NOT_STARTED_LOCKED' && !shift.canModify && !shift.canCancel;
      return { expect: 'NOT_STARTED_LOCKED modify=false cancel=false', real: shiftText(shift), pass };
    });

    await this.checkG('超过 24 小时未开始卡片 NOT_STARTED_EDITABLE', async (): Promise<CheckResult> => {
      const details: string[] = [];
      let pass = true;
      for (const key of ['editable1', 'editable2']) {
        const duty = this.duties.get(key)!;
        const shift = this.weekShifts.get(duty.id);
        const ok =
          shift?.state === 'NOT_STARTED_EDITABLE' &&
          shift.canModify &&
          shift.canCancel &&
          shift.pendingRequest === null;
        pass &&= ok;
        details.push(`${key}: ${shiftText(shift)}`);
      }
      return { expect: 'NOT_STARTED_EDITABLE modify=true cancel=true', real: details.join('; '), pass };
    });

    await this.checkG('每日 shifts 按开始时间升序', async (): Promise<CheckResult> => {
      const bad: string[] = [];
      for (const offset of [-1, 0, 1]) {
        const cal = must(await this.pd.calendar(this.userId, 'WEEK', offset), `calendar WEEK ${offset}`);
        for (const day of cal.days) {
          for (let i = 1; i < day.shifts.length; i++) {
            if (day.shifts[i - 1].startAt > day.shifts[i].startAt) bad.push(`${day.date}#${i}`);
          }
        }
      }
      return { expect: '升序', real: bad.length === 0 ? '升序' : bad.join(','), pass: bad.length === 0 };
    });

    await this.actG('读取月视图（本月/上月）', async () => {
      this.month0 = await this.pd.calendar(this.userId, 'MONTH', 0);
      this.monthPrev = await this.pd.calendar(this.userId, 'MONTH', -1);
    });

    await this.checkG('月视图：上线月份前报 MONTH_BEFORE_LAUNCH，否则结构正确', async (): Promise<CheckResult> => {
      const currentMonth = this.today.slice(0, 7);
      const launch = this.entry.minMonth;
      const diff = monthDiff(currentMonth, launch);
      if (diff < 0) {
        const r = this.month0!;
        return { expect: 'MONTH_BEFORE_LAUNCH', real: errText(r), pass: !r.ok && r.state === 'MONTH_BEFORE_LAUNCH' };
      }
      if (!this.month0?.ok) {
        return { expect: '月视图成功', real: errText(this.month0!), pass: false };
      }
      const cal = this.month0.content;
      const start = `${currentMonth}-01`;
      const end = `${currentMonth}-${pad2(daysInMonth(currentMonth))}`;
      const todayDays = cal.days.filter((d) => d.isToday).length;
      const pastOk = cal.days.every((d) => d.isPast === (d.date < this.today));
      const duty = this.duties.get('onDuty');
      const todayDay = cal.days.find((d) => d.date === this.today);
      const hasDutyOk = !duty || (todayDay?.hasDuty === true && todayDay.shifts.some((s) => s.dutyId === duty.id));
      const pass =
        cal.view === 'MONTH' &&
        cal.offset === 0 &&
        cal.startDate === start &&
        cal.endDate === end &&
        cal.days.length === daysInMonth(currentMonth) &&
        todayDays === 1 &&
        pastOk &&
        hasDutyOk;
      return {
        expect: `${start}~${end} ${daysInMonth(currentMonth)}天 isPast正确 hasDuty正确`,
        real: `${cal.startDate}~${cal.endDate} ${cal.days.length}天 today数=${todayDays} past=${pastOk} duty=${hasDutyOk}`,
        pass,
      };
    });

    await this.checkG('月视图 offset=-1 上月结构（未早于上线月份时）', async (): Promise<CheckResult> => {
      const currentMonth = this.today.slice(0, 7);
      const target = addMonths(currentMonth, -1);
      if (monthDiff(target, this.entry.minMonth) < 0) {
        const r = this.monthPrev!;
        return {
          expect: 'MONTH_BEFORE_LAUNCH',
          real: errText(r),
          pass: !r.ok && r.state === 'MONTH_BEFORE_LAUNCH',
        };
      }
      if (!this.monthPrev?.ok) return { expect: '成功', real: errText(this.monthPrev!), pass: false };
      const cal = this.monthPrev.content;
      const start = `${target}-01`;
      const end = `${target}-${pad2(daysInMonth(target))}`;
      const pass =
        cal.startDate === start && cal.endDate === end && cal.days.length === daysInMonth(target);
      return { expect: `${start}~${end}`, real: `${cal.startDate}~${cal.endDate} ${cal.days.length}天`, pass };
    });

    await this.checkG('非法 view 返回 INVALID_VIEW', async (): Promise<CheckResult> => {
      const r = await this.pd.calendar(this.userId, 'DAY', 0);
      return { expect: 'INVALID_VIEW', real: errText(r), pass: !r.ok && r.state === 'INVALID_VIEW' };
    });

    await this.checkG('非法 offset 返回 INVALID_OFFSET', async (): Promise<CheckResult> => {
      const week = await this.pd.calendar(this.userId, 'WEEK', 2);
      const month = await this.pd.calendar(this.userId, 'MONTH', 1);
      const pass = !week.ok && week.state === 'INVALID_OFFSET' && !month.ok && month.state === 'INVALID_OFFSET';
      return {
        expect: 'WEEK:INVALID_OFFSET MONTH:INVALID_OFFSET',
        real: `WEEK:${errText(week)} MONTH:${errText(month)}`,
        pass,
      };
    });

    await this.actG('提交新增值班申请', async () => {
      this.addTarget = await this.findFreeTarget();
      const r = await this.pd.add(this.userId, this.addTarget.date, this.addTarget.slotKey);
      if (!r.ok) throw new Error(`request/add: ${r.state} ${r.message}`);
      this.addRequestId = r.content.requestId;
      this.requestIds.push(this.addRequestId);
      this.log(
        `新增申请 id=${this.addRequestId} target=${this.addTarget.date} ${this.addTarget.slotKey} status=${r.content.status}`,
      );
    });

    await this.checkG('新增申请成功且 DB 快照正确', async (): Promise<CheckResult> => {
      const t = this.addTarget!;
      const row = await this.pd.queryRequest(this.addRequestId);
      const pass =
        !!row &&
        row['request_type'] === 'ADD' &&
        row['status'] === 'PENDING' &&
        row['source'] === 'PLAYER' &&
        row['locale'] === this.locale &&
        Number(row['player_id']) === this.userId &&
        row['original_date'] === null &&
        Number(row['target_date']) === t.dateInt &&
        Number(row['target_start_time']) === t.startTime &&
        Number(row['target_end_time']) === t.endTime &&
        Number(row['deadline_at']) === t.startAt;
      return {
        expect: `ADD/PENDING/PLAYER target=${t.dateInt}/${t.startTime} deadline=${t.startAt} original=null`,
        real: row
          ? `${row['request_type']}/${row['status']}/${row['source']} target=${row['target_date']}/${row['target_start_time']} deadline=${row['deadline_at']} original=${row['original_date'] ?? 'null'}`
          : '未找到申请',
        pass,
      };
    });

    await this.checkG('申请记录展示 ADD：仅 target 无 original', async (): Promise<CheckResult> => {
      const list = must(await this.pd.requests(this.userId), 'requests');
      const item = list.find((x) => x.id === this.addRequestId);
      const t = this.addTarget!;
      const pass =
        !!item &&
        item.type === 'ADD' &&
        item.status === 'PENDING' &&
        item.original === null &&
        item.target?.date === t.date &&
        hhmmToInt(item.target?.startTime ?? '') === t.startTime;
      return {
        expect: `ADD target=${t.date} ${intToHhmm(t.startTime)} original=null`,
        real: item
          ? `${item.type} target=${item.target?.date ?? 'null'} ${item.target?.startTime ?? 'null'} original=${item.original ? '有' : 'null'}`
          : '未找到申请',
        pass,
      };
    });

    await this.checkG('待审核 ADD 不生成值班卡片', async (): Promise<CheckResult> => {
      const t = this.addTarget!;
      for (const offset of [-1, 0, 1]) {
        const cal = must(await this.pd.calendar(this.userId, 'WEEK', offset), `calendar WEEK ${offset}`);
        const day = cal.days.find((d) => d.date === t.date);
        if (!day) continue;
        const hit = day.shifts.filter((s) => s.startTime === intToHhmm(t.startTime));
        return {
          expect: `${t.date} ${intToHhmm(t.startTime)} 无卡片`,
          real: `${hit.length} 条卡片`,
          pass: hit.length === 0,
        };
      }
      return { expect: `${t.date} 在周视图中`, real: '未见该日期', pass: false };
    });

    await this.checkG('重复 ADD 同一时段返回 REQUEST_CONFLICT', async (): Promise<CheckResult> => {
      const t = this.addTarget!;
      const r = await this.pd.add(this.userId, t.date, t.slotKey);
      return { expect: 'REQUEST_CONFLICT', real: errText(r), pass: !r.ok && r.state === 'REQUEST_CONFLICT' };
    });

    await this.checkG('新增申请负例：24h/下周日/日期/班次/排班冲突', async (): Promise<CheckResult> => {
      const slot = this.entry.slots[0];
      const tooSoon = await this.pd.add(this.userId, this.today, slot.key);
      const outOfRange = await this.pd.add(this.userId, addDays(this.maxApplyDate, 1), slot.key);
      const badDate = await this.pd.add(this.userId, '2026-13-45', slot.key);
      const badSlot = await this.pd.add(this.userId, this.maxApplyDate, '10-12');
      let conflict = 'SKIP';
      if (this.conflictDuty?.slotKey) {
        const r = await this.pd.add(this.userId, this.conflictDuty.date, this.conflictDuty.slotKey);
        conflict = errText(r);
      }
      const pass =
        !tooSoon.ok &&
        tooSoon.state === 'TARGET_TOO_SOON' &&
        !outOfRange.ok &&
        outOfRange.state === 'TARGET_OUT_OF_RANGE' &&
        !badDate.ok &&
        badDate.state === 'INVALID_DATE' &&
        !badSlot.ok &&
        badSlot.state === 'INVALID_SLOT' &&
        (conflict === 'SKIP' || conflict === 'SHIFT_CONFLICT');
      return {
        expect: 'TARGET_TOO_SOON/TARGET_OUT_OF_RANGE/INVALID_DATE/INVALID_SLOT/SHIFT_CONFLICT',
        real: `${errText(tooSoon)}/${errText(outOfRange)}/${errText(badDate)}/${errText(badSlot)}/${conflict}`,
        pass,
      };
    });

    await this.actG('提交修改值班申请', async () => {
      const exclude = new Set([`${this.addTarget!.date}|${this.addTarget!.slotKey}`]);
      this.modifyTarget = await this.findFreeTarget(exclude);
      const duty = this.duties.get('editable1')!;
      const r = await this.pd.modify(this.userId, duty.id, this.modifyTarget.date, this.modifyTarget.slotKey);
      if (!r.ok) throw new Error(`request/modify: ${r.state} ${r.message}`);
      this.modifyRequestId = r.content.requestId;
      this.requestIds.push(this.modifyRequestId);
      this.log(
        `修改申请 id=${this.modifyRequestId} duty=${duty.id} -> ${this.modifyTarget.date} ${this.modifyTarget.slotKey}`,
      );
    });

    await this.checkG('修改申请成功且原/新时段快照正确', async (): Promise<CheckResult> => {
      const duty = this.duties.get('editable1')!;
      const t = this.modifyTarget!;
      const row = await this.pd.queryRequest(this.modifyRequestId);
      const pass =
        !!row &&
        row['request_type'] === 'MODIFY' &&
        row['status'] === 'PENDING' &&
        Number(row['duty_id']) === duty.id &&
        Number(row['original_date']) === duty.dateInt &&
        Number(row['original_start_time']) === duty.startTime &&
        Number(row['original_end_time']) === duty.endTime &&
        Number(row['target_date']) === t.dateInt &&
        Number(row['target_start_time']) === t.startTime &&
        Number(row['target_end_time']) === t.endTime &&
        Number(row['deadline_at']) === t.startAt;
      return {
        expect: `MODIFY original=${duty.dateInt}/${duty.startTime} target=${t.dateInt}/${t.startTime} deadline=${t.startAt}`,
        real: row
          ? `${row['request_type']} original=${row['original_date']}/${row['original_start_time']} target=${row['target_date']}/${row['target_start_time']} deadline=${row['deadline_at']}`
          : '未找到申请',
        pass,
      };
    });

    await this.checkG('申请记录展示 MODIFY：original + target', async (): Promise<CheckResult> => {
      const list = must(await this.pd.requests(this.userId), 'requests');
      const item = list.find((x) => x.id === this.modifyRequestId);
      const duty = this.duties.get('editable1')!;
      const t = this.modifyTarget!;
      const pass =
        !!item &&
        item.type === 'MODIFY' &&
        item.original?.date === duty.date &&
        hhmmToInt(item.original?.startTime ?? '') === duty.startTime &&
        item.target?.date === t.date &&
        hhmmToInt(item.target?.startTime ?? '') === t.startTime;
      return {
        expect: `original=${duty.date} ${intToHhmm(duty.startTime)} target=${t.date} ${intToHhmm(t.startTime)}`,
        real: item
          ? `original=${item.original?.date ?? 'null'} ${item.original?.startTime ?? 'null'} target=${item.target?.date ?? 'null'} ${item.target?.startTime ?? 'null'}`
          : '未找到申请',
        pass,
      };
    });

    await this.checkG('已申请修改的值班卡片变为 APPLY_PENDING/MODIFY', async (): Promise<CheckResult> => {
      const duty = this.duties.get('editable1')!;
      const shifts = await this.loadWeekShifts();
      const shift = shifts.get(duty.id);
      const pass =
        shift?.state === 'APPLY_PENDING' &&
        !shift.canModify &&
        !shift.canCancel &&
        shift.pendingRequest?.id === this.modifyRequestId &&
        shift.pendingRequest?.type === 'MODIFY' &&
        shift.pendingRequest?.status === 'PENDING';
      return {
        expect: `APPLY_PENDING MODIFY/${this.modifyRequestId}`,
        real: shiftText(shift),
        pass,
      };
    });

    await this.checkG('同一值班重复 MODIFY/CANCEL 返回 DUTY_HAS_PENDING_REQUEST', async (): Promise<CheckResult> => {
      const duty = this.duties.get('editable1')!;
      const modify = await this.pd.modify(
        this.userId,
        duty.id,
        this.modifyTarget!.date,
        this.modifyTarget!.slotKey,
      );
      const cancel = await this.pd.cancel(this.userId, duty.id);
      const pass =
        !modify.ok &&
        modify.state === 'DUTY_HAS_PENDING_REQUEST' &&
        !cancel.ok &&
        cancel.state === 'DUTY_HAS_PENDING_REQUEST';
      return {
        expect: 'DUTY_HAS_PENDING_REQUEST / DUTY_HAS_PENDING_REQUEST',
        real: `${errText(modify)} / ${errText(cancel)}`,
        pass,
      };
    });

    await this.checkG('MODIFY 不存在的值班返回 DUTY_NOT_FOUND', async (): Promise<CheckResult> => {
      const t = this.addTarget!;
      const r = await this.pd.modify(this.userId, 999_999_999, t.date, t.slotKey);
      return { expect: 'DUTY_NOT_FOUND', real: errText(r), pass: !r.ok && r.state === 'DUTY_NOT_FOUND' };
    });

    await this.checkG('MODIFY 已开始/24h 内值班返回 DUTY_STARTED', async (): Promise<CheckResult> => {
      const duty = this.duties.get('onDuty') ?? this.duties.get('pastComplete')!;
      const t = this.addTarget!;
      const r = await this.pd.modify(this.userId, duty.id, t.date, t.slotKey);
      return { expect: 'DUTY_STARTED', real: errText(r), pass: !r.ok && r.state === 'DUTY_STARTED' };
    });

    await this.checkG('MODIFY 目标与原时段相同返回 SAME_AS_CURRENT', async (): Promise<CheckResult> => {
      const duty = this.conflictDuty;
      if (!duty || !duty.slotKey) this.skip('未造出固定班次值班，跳过 SAME_AS_CURRENT');
      const r = await this.pd.modify(this.userId, duty!.id, duty!.date, duty!.slotKey!);
      return { expect: 'SAME_AS_CURRENT', real: errText(r), pass: !r.ok && r.state === 'SAME_AS_CURRENT' };
    });

    await this.actG('提交取消值班申请', async () => {
      const duty = this.duties.get('editable2')!;
      const r = await this.pd.cancel(this.userId, duty.id);
      if (!r.ok) throw new Error(`request/cancel: ${r.state} ${r.message}`);
      this.cancelRequestId = r.content.requestId;
      this.requestIds.push(this.cancelRequestId);
      this.log(`取消申请 id=${this.cancelRequestId} duty=${duty.id}`);
    });

    await this.checkG('取消申请成功且快照/截止时间正确', async (): Promise<CheckResult> => {
      const duty = this.duties.get('editable2')!;
      const row = await this.pd.queryRequest(this.cancelRequestId);
      const pass =
        !!row &&
        row['request_type'] === 'CANCEL' &&
        row['status'] === 'PENDING' &&
        Number(row['duty_id']) === duty.id &&
        Number(row['original_date']) === duty.dateInt &&
        Number(row['original_start_time']) === duty.startTime &&
        Number(row['original_end_time']) === duty.endTime &&
        row['target_date'] === null &&
        Number(row['deadline_at']) === duty.startAt;
      return {
        expect: `CANCEL original=${duty.dateInt}/${duty.startTime} target=null deadline=${duty.startAt}`,
        real: row
          ? `${row['request_type']} original=${row['original_date']}/${row['original_start_time']} target=${row['target_date'] ?? 'null'} deadline=${row['deadline_at']}`
          : '未找到申请',
        pass,
      };
    });

    await this.checkG('已申请取消的值班卡片变为 APPLY_PENDING/CANCEL', async (): Promise<CheckResult> => {
      const duty = this.duties.get('editable2')!;
      const shifts = await this.loadWeekShifts();
      const shift = shifts.get(duty.id);
      const pass =
        shift?.state === 'APPLY_PENDING' &&
        shift.pendingRequest?.id === this.cancelRequestId &&
        shift.pendingRequest?.type === 'CANCEL' &&
        shift.pendingRequest?.status === 'PENDING';
      return {
        expect: `APPLY_PENDING CANCEL/${this.cancelRequestId}`,
        real: shiftText(shift),
        pass,
      };
    });

    await this.checkG('同一值班重复 CANCEL 返回 DUTY_HAS_PENDING_REQUEST', async (): Promise<CheckResult> => {
      const r = await this.pd.cancel(this.userId, this.duties.get('editable2')!.id);
      return {
        expect: 'DUTY_HAS_PENDING_REQUEST',
        real: errText(r),
        pass: !r.ok && r.state === 'DUTY_HAS_PENDING_REQUEST',
      };
    });

    await this.actG('读取近 30 天申请记录', async () => {
      must(await this.pd.requests(this.userId), 'requests');
    });

    await this.checkG('超时申请被懒更新为 REJECTED/System', async (): Promise<CheckResult> => {
      const list = must(await this.pd.requests(this.userId), 'requests');
      const item: DutyRequestItem | undefined = list.find((x) => x.id === this.timeoutRequestId);
      const row = await this.pd.queryRequest(this.timeoutRequestId);
      const apiOk =
        !!item &&
        item.status === 'REJECTED' &&
        item.operatorName === 'System' &&
        item.reviewAt !== null;
      const dbOk =
        !!row &&
        row['status'] === 'REJECTED' &&
        row['source'] === 'SYSTEM' &&
        row['operator_name'] === 'System' &&
        row['review_at'] !== null;
      return {
        expect: 'REJECTED/System，reviewAt 非空，DB source=SYSTEM',
        real: item
          ? `api=${item.status}/${item.operatorName ?? 'null'}/${item.reviewAt ?? 'null'} db=${row?.['status']}/${row?.['source']}/${row?.['operator_name'] ?? 'null'}`
          : '申请记录未找到',
        pass: apiOk && dbOk,
      };
    });

    await this.checkG('申请记录按 applyAt 倒序且均在近 30 天', async (): Promise<CheckResult> => {
      const list = must(await this.pd.requests(this.userId), 'requests');
      const badOrder: string[] = [];
      for (let i = 1; i < list.length; i++) {
        if (list[i - 1].applyAt < list[i].applyAt) badOrder.push(`${list[i - 1].id}>${list[i].id}`);
      }
      const from = Date.now() - 30 * DAY_MS - 60_000;
      const badRange = list.filter((x) => x.applyAt < from).map((x) => x.id);
      return {
        expect: 'applyAt 倒序且 >= now-30d',
        real:
          badOrder.length === 0 && badRange.length === 0
            ? `${list.length} 条`
            : `顺序异常=${badOrder.join(',')} 超期=${badRange.join(',')}`,
        pass: badOrder.length === 0 && badRange.length === 0,
      };
    });

    await this.actG('定位非陪玩师账号并调用接口', async () => {
      const candidates = NON_PLAYER_ID_ARG
        ? [Number(NON_PLAYER_ID_ARG)]
        : await this.pd.findNonPlayerIds(this.locale, 20);
      for (const id of candidates.slice(0, 5)) {
        if (id === this.userId) continue;
        const entry = await this.pd.entry(id);
        if (!entry.ok || entry.content.isPlayer) continue;
        this.nonPlayerId = id;
        this.nonPlayerEntry = entry;
        this.nonPlayerCalendar = await this.pd.calendar(id, 'WEEK', 0);
        this.nonPlayerAdd = await this.pd.add(id, this.addTarget!.date, this.addTarget!.slotKey);
        break;
      }
      this.log(`非陪玩师=${this.nonPlayerId || '未找到'}`);
    });

    await this.checkG('非陪玩师入口 isPlayer=false 且 visible=false', async (): Promise<CheckResult> => {
      if (this.nonPlayerId === 0) this.skip('大区下未找到非陪玩师账号');
      const e = this.nonPlayerEntry!;
      const pass = e.ok && !e.content.isPlayer && !e.content.visible;
      return {
        expect: 'isPlayer=false visible=false',
        real: e.ok ? `isPlayer=${e.content.isPlayer} visible=${e.content.visible}` : errText(e),
        pass,
      };
    });

    await this.checkG('非陪玩师日历/申请返回 NOT_A_PLAYER', async (): Promise<CheckResult> => {
      if (this.nonPlayerId === 0) this.skip('大区下未找到非陪玩师账号');
      const cal = this.nonPlayerCalendar!;
      const add = this.nonPlayerAdd!;
      const pass =
        !cal.ok && cal.state === 'NOT_A_PLAYER' && !add.ok && add.state === 'NOT_A_PLAYER';
      return {
        expect: 'calendar:NOT_A_PLAYER add:NOT_A_PLAYER',
        real: `calendar:${errText(cal)} add:${errText(add)}`,
        pass,
      };
    });

    await this.act('清理测试数据', async () => {
      if (KEEP_DATA) {
        this.log('--keep-data 已开启，保留测试数据');
        return;
      }
      await this.pd.deleteRequestIds(this.requestIds);
      await this.pd.deleteDutyIds(this.dutyIds);
      await this.pd.deleteRequestsByRemarkPrefix(this.locale, this.userId, REMARK_PREFIX);
      this.cleaned = true;
      this.log(`已清理：申请=${this.requestIds.length} 条，值班=${this.dutyIds.length} 条`);
    });
  }
}

await new PlayerDutySmoke().execute();
