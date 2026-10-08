import { config } from "../apps/api/config";
import { Store } from "../apps/api/store";
const store = new Store(config.database);
try {
  console.log(
    JSON.stringify({
      ok: true,
      migrations: store.db
        .prepare("SELECT version FROM schema_migrations")
        .all(),
    }),
  );
} finally {
  store.close();
}
