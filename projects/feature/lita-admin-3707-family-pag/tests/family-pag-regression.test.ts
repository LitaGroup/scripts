/**
 * 项目3707 / 缺陷修复回归入口：执行 #3～#12（跳过 #2 新增保存）。
 * 原因：需求方单记录约束——专用记录 BOT_TEST_PAG_3707 已存在且页面无删除入口，
 *       #2 的前置 BD-NEW（记录不存在）不成立，平台重复运行时不得再次新增第二条记录。
 * 用例来源与判定标准同 family-pag-upload-display.test.ts（TK-0127 HANDOFF #3～#12）。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=*** node projects/feature/lita-admin-3707-family-pag/tests/family-pag-regression.test.ts
 */
process.env.FAMILY_PAG_FROM = '3';
await import('./family-pag-upload-display.test.ts');
