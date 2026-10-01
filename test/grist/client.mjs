/**
 * REST access to a real Grist instance, shaped like a widget's `grist` object
 * (`docApi.listTables / fetchTable / applyUserActions`). The instance is
 * GRIST_URL (default http://localhost:8484), reached through Grist's "minimal"
 * login (GRIST_DEFAULT_EMAIL) or with GRIST_API_KEY.
 */

const BASE = (process.env.GRIST_URL ?? "http://localhost:8484").replace(/\/$/, "");

async function call(headers, method, path, body) {
  const hasBody = body !== undefined;
  const res = await fetch(BASE + path, {
    method,
    headers: hasBody ? { ...headers, "Content-Type": "application/json" } : headers,
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {} // an error page is not always JSON
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${data?.error ?? text}`);
  return data;
}

/** A session of its own for every process (an API key would be replaced by the next process asking for one). */
async function authHeaders() {
  if (process.env.GRIST_API_KEY) return { Authorization: `Bearer ${process.env.GRIST_API_KEY}` };
  const login = await fetch(`${BASE}/login?next=/`, { redirect: "manual" });
  const session = login.headers.getSetCookie().filter((cookie) => !cookie.includes("Expires=Thu, 01 Jan 1970")).map((cookie) => cookie.split(";")[0]);
  if (session.length === 0) throw new Error(`Cannot log in to ${BASE} (no session cookie, HTTP ${login.status})`);
  return { Cookie: session.join("; "), "X-Requested-With": "XMLHttpRequest" };
}

/** Rows of a column-oriented table (`{id: [...], colId: [...]}`). */
export function rows(columnar) {
  const keys = Object.keys(columnar);
  return columnar.id.map((_, i) => Object.fromEntries(keys.map((key) => [key, columnar[key][i]])));
}

function openDoc(request, id) {
  const base = `/api/docs/${id}`;
  const fetchTable = (tableId) => request("GET", `${base}/tables/${encodeURIComponent(tableId)}/data`);
  const doc = {
    id,
    /** Every batch of user actions the widget sent, in order. */
    batches: [],
    fetchTable,
    apply: (actions) => request("POST", `${base}/apply?noparse=1`, actions),
    /** `_grist_Tables_column` rows of one table in position order, hidden columns included. */
    async columns(tableId) {
      const [tables, columns] = await Promise.all([fetchTable("_grist_Tables"), fetchTable("_grist_Tables_column")]);
      const table = rows(tables).find((row) => row.tableId === tableId);
      return table ? rows(columns).filter((col) => col.parentId === table.id).sort((a, b) => a.parentPos - b.parentPos) : null;
    },
    async tableIds() {
      return (await fetchTable("_grist_Tables")).tableId;
    },
  };
  doc.grist = {
    docApi: {
      listTables: () => doc.tableIds(),
      fetchTable,
      applyUserActions: (actions) => {
        doc.batches.push(actions);
        return doc.apply(actions);
      },
    },
  };
  return doc;
}

/** Logs in and returns `{ newDoc(name), cleanup() }`; a new document only holds Grist's default `Table1`. */
export async function connect() {
  const headers = await authHeaders();
  const request = (method, path, body) => call(headers, method, path, body);
  const orgs = await request("GET", "/api/orgs");
  const org = orgs.find((candidate) => candidate.owner) ?? orgs[0];
  const [workspace] = await request("GET", `/api/orgs/${org.id}/workspaces`);
  const workspaceId = workspace?.id ?? (await request("POST", `/api/orgs/${org.id}/workspaces`, { name: "Tests" }));
  const created = new Set();
  return {
    async newDoc(name = "test") {
      const id = await request("POST", `/api/workspaces/${workspaceId}/docs`, { name });
      created.add(id);
      return openDoc(request, id);
    },
    /** Deletes the documents created so far (all of them, or just `ids`). */
    async cleanup(ids = [...created]) {
      await Promise.all(ids.map((id) => request("DELETE", `/api/docs/${id}`).finally(() => created.delete(id))));
    },
  };
}
