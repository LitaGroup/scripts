# 示例代码



基础环境：模拟器已经完成了 Lita App的安装



1. 处理登录状态为未登录

打开APP，进入到首页

判断登录状态，如果已经登录了，则退出登录，彻底关闭APP



2. 验证 手机号 密码登录

再次打开APP，点击进入 我的 tab

使用账号密码：`18611755224`  `123456`

如果需要验证码，则通过数据库查询（根据环境判断是生产库还是测试库）

-- stats 库

select code from lita_stats.sms_record_{yyyyMM} where phone_prefix='86' and phone_number='8618611755224' and type=1 and created_at > {date_time}



3. 判断是否登录成功

进入我的页，能抓取到ID





