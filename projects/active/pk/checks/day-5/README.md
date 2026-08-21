# 第5天检查

> 针对 260817 的PK检查，检查日期：2026-08-21 的数据

## 时间配置

- `2026-08-21T23:07:00+08:00` topic=player_100_50 locale=ko key=20260821 的日榜结算
- `2026-08-22T00:07:00+08:00` topic=player_100_50 locale=ph key=20260821 的日榜结算
- `2026-08-22T01:07:00+08:00`
  - topic=player_100_50 locale=vi key=20260821 的日榜结算
  - topic=player_in_200_100 locale=in key=20260821 的日榜结算

## 检查内容

### 陪玩师榜 - 日榜奖励发放

- 结算检查：

  - 检查 状态 是否为已结算：

    - select * from mod_common_round where biz={} and topic={} and `key`="{}" and locale='{locale}'
    - status 预期 200

  - 检查发奖情况是否符合预期

    - 获取前 n 名

      - ```
        curl --request POST \
          --url {host}/active/v3/pk-v202608/m/user/rank \
          --header 'Content-Type: application/json' \
          --header 'l-user-id: 7586' \
          --header 'l-user-locale: in' \  # 指定大区
          --data '{
            "key": "20260821",
            "count": 100 # 前 n 名
        }'
        ```

    - 获取奖励配置 `http://localhost:3000/api/documents/12.md`

    - 获取奖励实际发放

    - 进行匹配检查
