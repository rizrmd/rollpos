import { Database } from "@nozbe/watermelondb"
import LokiJSAdapter from "@nozbe/watermelondb/adapters/lokijs"

import { migrations } from "./migrations"
import Product from "./models/Product"
import { schema } from "./schema"

const adapter = new LokiJSAdapter({
  schema,
  migrations,
  dbName: "rollpos",
  useWebWorker: false,
  useIncrementalIndexedDB: true,
  onSetUpError: (error) => {
    console.error("WatermelonDB failed to start", error)
  },
  onQuotaExceededError: (error) => {
    console.error("WatermelonDB is out of disk quota", error)
  },
})

export const database = new Database({
  adapter,
  modelClasses: [Product],
})
