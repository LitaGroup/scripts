/**
 * 项目139 / 广播召人配置批量删除接口契约测试
 *
 * 覆盖：
 * 1. 空请求体 / roomIds 为空 → status=1、msg=请选择要删除的数据；
 * 2. 正常删除 → status=0、data=成功删除N条数据；
 * 3. 重复 roomId 去重后不重复计数；
 * 4. 不存在的 roomId 直接忽略 → 成功删除0条数据；
 * 5. 与只读 DB 核对记录确实被删除。
 *
 * 运行：
 *   ADMIN_USERNAME=admin ADMIN_PASSWORD=*** LITA_USER_TOKEN=*** \
 *   node projects/feature/lita-admin-139-batch-delete/tests/broad-batch-delete-api.test.ts
 */
import { AdminBase, EN_ROOM_IDS } from './lib/admin-base.ts';

class BroadBatchDeleteApi extends AdminBase {
  private roomIds: number[] = [];

  constructor() {
    super('broad-batch-delete-api');
    this.total = 7;
  }

  private async add(roomId: number): Promise<void> {
    const response = await this.api('/api/voiceroom/broad/add', {
      method: 'POST',
      body: { roomId, priority: 55, userNum: 15, isNotity: '0', opUser: 'admin' },
    });
    if (String(response.json?.status) !== '0') throw new Error(`新增广播召人配置失败 roomId=${roomId}: ${response.json?.msg}`);
    this.roomIds.push(roomId);
  }

  private async del(body: unknown): Promise<{ status: string; msg: string; data: string }> {
    const response = await this.api('/api/voiceroom/broad/batchDelete', { method: 'POST', body });
    return { status: String(response.json?.status), msg: String(response.json?.msg ?? ''), data: String(response.json?.data ?? '') };
  }

  private async exists(roomId: number): Promise<boolean> {
    const response = await this.api(`/api/voiceroom/broad/list?page=1&rows=10&roomId=${roomId}`);
    return (response.json?.data?.data ?? []).length > 0;
  }

  async run(): Promise<void> {
    try {
      await this.act('管理员真实登录并获取本次会话 token', async () => {
        await this.login();
      });

      await this.act('空请求体：返回请选择要删除的数据', async () => {
        const result = await this.del({});
        this.log(`空对象响应=${JSON.stringify(result)}`);
        if (result.status !== '1' || result.msg !== '请选择要删除的数据') throw new Error(`空对象响应不符: ${JSON.stringify(result)}`);
      });

      await this.act('roomIds 为空数组：返回请选择要删除的数据', async () => {
        const result = await this.del({ roomIds: [] });
        this.log(`空数组响应=${JSON.stringify(result)}`);
        if (result.status !== '1' || result.msg !== '请选择要删除的数据') throw new Error(`空数组响应不符: ${JSON.stringify(result)}`);
      });

      await this.act('正常删除并核对成功文案与数据库记录', async () => {
        const roomId = EN_ROOM_IDS[0];
        await this.add(roomId);
        if (!(await this.exists(roomId))) throw new Error('新增后记录不存在');
        const result = await this.del({ roomIds: [roomId] });
        this.log(`正常删除响应=${JSON.stringify(result)}`);
        if (result.status !== '0' || result.data !== '成功删除1条数据') throw new Error(`正常删除响应不符: ${JSON.stringify(result)}`);
        if (await this.exists(roomId)) throw new Error('删除后接口仍能查到记录');
        const dbRows = await this.dbQuery(`select room_id from voice_room_broad_list where room_id in (${roomId})`, 'basic');
        if (dbRows.length > 0) throw new Error('删除后数据库仍存在记录');
        this.roomIds = this.roomIds.filter((id) => id !== roomId);
      });

      await this.act('重复 roomId：去重后按 1 条计数', async () => {
        const roomId = EN_ROOM_IDS[1];
        await this.add(roomId);
        const result = await this.del({ roomIds: [roomId, roomId] });
        this.log(`重复ID响应=${JSON.stringify(result)}`);
        if (result.status !== '0' || result.data !== '成功删除1条数据') throw new Error(`重复 ID 响应不符: ${JSON.stringify(result)}`);
        if (await this.exists(roomId)) throw new Error('重复 ID 删除后记录仍存在');
        this.roomIds = this.roomIds.filter((id) => id !== roomId);
      });

      await this.act('不存在的 roomId：忽略并返回成功删除0条数据', async () => {
        const result = await this.del({ roomIds: [999999999] });
        this.log(`不存在ID响应=${JSON.stringify(result)}`);
        if (result.status !== '0' || result.data !== '成功删除0条数据') throw new Error(`不存在 ID 响应不符: ${JSON.stringify(result)}`);
      });

      await this.act('混合存在/不存在 roomId：仅删除存在记录', async () => {
        const roomId = EN_ROOM_IDS[2];
        await this.add(roomId);
        const result = await this.del({ roomIds: [roomId, 999999999] });
        this.log(`混合响应=${JSON.stringify(result)}`);
        if (result.status !== '0' || result.data !== '成功删除1条数据') throw new Error(`混合 ID 响应不符: ${JSON.stringify(result)}`);
        if (await this.exists(roomId)) throw new Error('混合删除后记录仍存在');
        this.roomIds = this.roomIds.filter((id) => id !== roomId);
      });
    } finally {
      const leftovers = [];
      for (const roomId of this.roomIds) {
        if (await this.exists(roomId).catch(() => false)) leftovers.push(roomId);
      }
      if (leftovers.length > 0) {
        const result = await this.del({ roomIds: leftovers }).catch(() => null);
        this.log(`清理测试数据 roomIds=${leftovers.join(',')} 结果=${JSON.stringify(result)}`);
      }
    }
  }
}

await new BroadBatchDeleteApi().execute();
