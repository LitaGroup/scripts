import { TestBaseClass } from '../../../../../src/base/TestBaseClass.ts';
import { LOCALE, USER_A } from './constants.ts';
import { T_D1, localIso } from './times.ts';

/**
 * didibus 用例基类。
 * 首个 act 探测业务接口可访问性（l-debug-timestamp 生效 + 活动时间窗口内）。
 * 注意 debug 时间格式：`yyyy-MM-ddTHH:mm:ss` 或带 ±HH:mm 偏移，不支持毫秒/空格分隔
 * （解析失败会静默回退真实时间，导致 Activity is not active）。
 */
export abstract class DidibusTestBase extends TestBaseClass {
  private activeReachable: boolean | null = null;

  /** 第一步：探测活动可访问性 */
  protected async probeActive(): Promise<void> {
    await this.act('探测活动可访问（l-debug-timestamp 生效且落在活动窗口）', async () => {
      try {
        await this.didibus.accountDetail(USER_A, LOCALE, localIso(LOCALE, T_D1));
        this.activeReachable = true;
      } catch (e) {
        if ((e as Error).message.includes('Activity is not active')) {
          this.activeReachable = false;
          throw new Error('Activity is not active：debug 时间未生效（检查格式/配置），详见 CASES.md 模拟时间约定');
        }
        throw e;
      }
    });
  }

  /** 后续步骤前置：活动不可访问时 skip */
  protected needActive(): void {
    if (this.activeReachable === false) {
      this.skip('活动不可访问（debug 时间未生效或配置问题）');
    }
  }
}
