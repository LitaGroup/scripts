import { CheckBaseClass } from './CheckBaseClass.ts';
import { APITestResource } from '../resources/APITestResource.ts';
import { MySQLTestResource } from '../resources/MySQLTestResource.ts';
import { RedisTestResource } from '../resources/RedisTestResource.ts';
import { PkFamilyService } from '../services/PkFamilyService.ts';
import { LitaTeamMessageService } from '../services/LitaTeamMessageService.ts';

/**
 * 测试用例基类（测试环境）。
 * 依赖测试环境资源：api（不带 token）、mysql（直连读写）、redis（直连）。
 */
export abstract class TestBaseClass extends CheckBaseClass {
  private _api: APITestResource | null = null;
  private _mysql: MySQLTestResource | null = null;
  private _redis: RedisTestResource | null = null;
  private _family: PkFamilyService | null = null;
  private _litaTeam: LitaTeamMessageService | null = null;

  protected get api(): APITestResource {
    return (this._api ??= new APITestResource());
  }

  protected get mysql(): MySQLTestResource {
    return (this._mysql ??= new MySQLTestResource());
  }

  protected get redis(): RedisTestResource {
    return (this._redis ??= new RedisTestResource());
  }

  protected get family(): PkFamilyService {
    return (this._family ??= new PkFamilyService({ api: this.api, mysql: this.mysql, redis: this.redis }));
  }

  protected get litaTeam(): LitaTeamMessageService {
    return (this._litaTeam ??= new LitaTeamMessageService(this.family));
  }

  async execute(): Promise<void> {
    try {
      await super.execute();
    } finally {
      await this.disposeResources();
    }
  }

  private async disposeResources(): Promise<void> {
    if (this._redis) {
      try {
        await this._redis.quit();
      } catch {
        // ignore
      }
    }
  }
}
