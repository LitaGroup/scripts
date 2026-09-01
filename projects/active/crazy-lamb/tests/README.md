# 测试用例



基础配置：

biz=`test-crazy-lamb-v202609`



## 1、初始化

数据清理：

```sql
delete from mod_common_round where biz={biz}
```

调用初始化接口：

```
curl --request POST \
  --url https://api.test.cinta.team/active/v3/test-crazy-lamb-v202609/p/init \
  --header 'l-debug-timestamp: 2026-09-11T12:30:30'

```



检查是否初始化成功：



- normal-daily   每个大区  每天一条记录  检查时间符合预期 检查 状态是否为 100
  - 总榜：2026年9月18日  14:00  utc+8  -  9月27日  23:59  （大区时间）
  - 日榜：大区时间每天一个，开始时间0点，结束时间次日0点，都是本地时间
- super-daily    每个大区  每天一条记录  检查时间符合预期 检查 状态是否为 100
  - 总榜：2026年9月18日  14:00  utc+8  -  9月27日  23:59  （大区时间）
  - 日榜：大区时间每天一个，开始时间0点，结束时间次日0点，都是本地时间
- room、receive-gift、send-gift  只有总榜，2026年9月18日  14:00  utc+8  -  9月27日  23:59  （大区时间）  检查时间符合预期 检查 状态是否为 100
- room-task 只有一条子榜，key为：`20260918`，时间为：2026年9月18日  14:00  utc+8  -  9月27日  23:59  （大区时间）







