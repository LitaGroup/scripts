export const DATABASES = {
  active: '活动类数据库',
  funbit: '核心业务库',
  basic: '基础业务库',
  family: '家族相关的库',
  stats: '数据统计的结果库',
  odps: '数据仓库的库',
} as const;

export type Database = keyof typeof DATABASES;

export function isDatabase(name: string): name is Database {
  return name in DATABASES;
}
