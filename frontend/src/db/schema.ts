import { appSchema, tableSchema } from "@nozbe/watermelondb"

export const schema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: "products",
      columns: [
        { name: "name", type: "string" },
        { name: "sku", type: "string", isIndexed: true },
        { name: "price", type: "number" },
        { name: "stock", type: "number" },
        { name: "created_at", type: "number" },
        { name: "updated_at", type: "number" },
      ],
    }),
  ],
})
