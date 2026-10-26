type Database = typeof import("../db/index").db;

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type DatabaseExecutor = Database | Transaction;
