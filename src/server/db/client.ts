import 'server-only';

export { getDb, hasDatabaseConfig, describeConnection, type Db, type ConnectionInfo } from './connection';
export * as schema from './schema';
