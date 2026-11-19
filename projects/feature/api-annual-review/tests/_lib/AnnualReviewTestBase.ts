import { TestBaseClass } from '../../../../../src/base/TestBaseClass.ts';
import { AnnualReviewClient } from './client.ts';

/**
 * 年度回忆接口测试基类（测试环境 api.test.cinta.team）。
 *
 * 时间与登录方式：
 * - `l-debug-timestamp`：框架测试头，用于模拟活动时间窗（格式 `yyyy-MM-ddTHH:mm:ss` 或带 `±HH:mm` 偏移）。
 * - `l-user-id` / `l-user-locale`：框架 Session 测试头，用于模拟登录用户与大区。
 * 两者均为测试环境能力，生产请求不依赖；本套用例只针对测试环境。
 */
export abstract class AnnualReviewTestBase extends TestBaseClass {
  private _annualReview: AnnualReviewClient | null = null;

  protected get annualReview(): AnnualReviewClient {
    return (this._annualReview ??= new AnnualReviewClient(this.api, (message) => this.log(message)));
  }
}
