import { Pool, PoolConfig } from 'pg';
import format from 'pg-format';

let _pgPool: Pool | null = null;

const pgConfig: PoolConfig = {
  host: process.env.PG_HOST,
  port: parseInt(process.env.PG_PORT ?? ''),
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
};

if (process.env.PG_SSL) pgConfig.ssl = { rejectUnauthorized: false };

_pgPool = new Pool(pgConfig);

export const runQuery = async (fmt: string, args: any[] = []) => {
  if (!_pgPool) return;

  const query = format(fmt);
  return _pgPool.query(query, args);
};
