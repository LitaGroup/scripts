编写一个线上的检查脚本：`day-3.check.ts`，表明是 pk 活动针对第3天的检查脚本，检查内容和步骤如下：



- 结算时间

  - `2026-08-19T22:37:00+08:00` topic=player_n_100 locale=ko 结算
  - `2026-08-19T23:37:00+08:00` topic=player_n_100 locale=ph 结算
  - `2026-08-20T00:37:00+08:00` 
    - topic=player_n_100 locale=vi 结算
    - topic=player_in_n_200 locale=in 结算
    - topic=room_in_n_200 locale=in 结算
    - topic=family_in_n_200 locale=in 结算

- 结算检查：

  - 检查 状态 是否为已结算：

    - select * from mod_common_round where biz={} and topic={} and `key`="-" and locale='{locale}'
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
            "key": "-", 
            "count": 100 # 前 n 名
        }'
        ```

      - 

    - 获取奖励配置 `http://localhost:3000/api/documents/12.md`

    - 获取奖励实际发放

    - 进行匹配

  - 检查入围名单：select * from mod_common_player_list where biz={biz} and `key`={topic} 是否前x名都进入榜单且score一致



