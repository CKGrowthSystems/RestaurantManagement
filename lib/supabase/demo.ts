/**
 * Minimal Supabase-JS look-alike over the in-memory demo store.
 * Supports only the query shapes we actually use.
 */

import { getStore } from "../demo-store";

type Row = Record<string, any>;
type Op = { kind: "eq" | "gte" | "gt" | "lte" | "lt" | "neq"; col: string; val: any };

class QueryBuilder<T extends Row = Row> implements PromiseLike<{ data: any; count: number | null; error: any }> {
  private ops: Op[] = [];
  private orderCol: string | null = null;
  private orderAsc = true;
  private limitN: number | null = null;
  private selectCols: string | null = "*";
  private countOpt: "exact" | null = null;
  private headOnly = false;
  private singleMode: "single" | "maybeSingle" | null = null;
  private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private payload: any = null;

  constructor(private table: string) {}

  select(cols = "*", opts?: { count?: "exact"; head?: boolean }) {
    this.selectCols = cols;
    if (opts?.count) this.countOpt = "exact";
    if (opts?.head) this.headOnly = true;
    return this;
  }
  eq(col: string, val: any)  { this.ops.push({ kind: "eq",  col, val }); return this; }
  neq(col: string, val: any) { this.ops.push({ kind: "neq", col, val }); return this; }
  gt(col: string, val: any)  { this.ops.push({ kind: "gt",  col, val }); return this; }
  gte(col: string, val: any) { this.ops.push({ kind: "gte", col, val }); return this; }
  lt(col: string, val: any)  { this.ops.push({ kind: "lt",  col, val }); return this; }
  lte(col: string, val: any) { this.ops.push({ kind: "lte", col, val }); return this; }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderCol = col; this.orderAsc = opts?.ascending ?? true; return this;
  }
  limit(n: number) { this.limitN = n; return this; }
  maybeSingle() { this.singleMode = "maybeSingle"; return this; }
  single()      { this.singleMode = "single";      return this; }

  insert(payload: Row | Row[]) { this.op = "insert"; this.payload = payload; return this; }
  update(payload: Row)         { this.op = "update"; this.payload = payload; return this; }
  delete()                     { this.op = "delete"; return this; }
  upsert(payload: Row)         { this.op = "upsert"; this.payload = payload; return this; }

  private matches(r: Row): boolean {
    for (const o of this.ops) {
      const v = r[o.col];
      switch (o.kind) {
        case "eq":  if (v !== o.val) return false; break;
        case "neq": if (v === o.val) return false; break;
        case "gt":  if (!(v > o.val))  return false; break;
        case "gte": if (!(v >= o.val)) return false; break;
        case "lt":  if (!(v < o.val))  return false; break;
        case "lte": if (!(v <= o.val)) return false; break;
      }
    }
    return true;
  }

  private tableRows(): Row[] {
    return (getStore() as any)[this.table] as Row[];
  }

  then<A, B>(resolve: (r: { data: any; count: number | null; error: any }) => A | PromiseLike<A>,
             _reject?: (r: any) => B | PromiseLike<B>): PromiseLike<A | B> {
    return new Promise<{ data: any; count: number | null; error: any }>((ok) => {
      ok(this.run());
    }).then(resolve);
  }

  private primaryKey(row: Row): any {
    if ("id" in row) return row.id;
    // Composite: memberships uses (user_id, restaurant_id); settings uses restaurant_id
    if (this.table === "memberships") return `${row.user_id}|${row.restaurant_id}`;
    if (this.table === "settings") return row.restaurant_id;
    return row.id;
  }

  private run(): { data: any; count: number | null; error: any } {
    const store = getStore() as any;
    const rows: Row[] = store[this.table];

    if (this.op === "insert" || this.op === "upsert") {
      const many = Array.isArray(this.payload) ? this.payload : [this.payload];
      const created: Row[] = [];
      for (const p of many) {
        const row = {
          id: p.id ?? (globalThis.crypto?.randomUUID?.() ?? `row-${Date.now()}-${Math.random()}`),
          created_at: new Date().toISOString(),
          ...p,
        };
        if (this.op === "upsert") {
          const pk = this.primaryKey(row);
          const idx = rows.findIndex((r) => this.primaryKey(r) === pk);
          if (idx >= 0) { rows[idx] = { ...rows[idx], ...p }; created.push(rows[idx]); continue; }
        }
        rows.push(row);
        created.push(row);
      }
      if (this.singleMode) return { data: created[0], count: null, error: null };
      return { data: created, count: created.length, error: null };
    }

    if (this.op === "update") {
      const updated: Row[] = [];
      for (const r of rows) {
        if (!this.matches(r)) continue;
        Object.assign(r, this.payload);
        (r as any).updated_at = new Date().toISOString();
        updated.push(r);
      }
      if (this.singleMode) return { data: updated[0] ?? null, count: null, error: null };
      return { data: updated, count: updated.length, error: null };
    }

    if (this.op === "delete") {
      const remaining: Row[] = [];
      const removed: Row[] = [];
      for (const r of rows) (this.matches(r) ? removed : remaining).push(r);
      store[this.table] = remaining;
      return { data: removed, count: removed.length, error: null };
    }

    // SELECT
    let result = rows.filter((r) => this.matches(r));
    if (this.orderCol) {
      const col = this.orderCol, asc = this.orderAsc;
      result = [...result].sort((a, b) => {
        const av = a[col], bv = b[col];
        if (av === bv) return 0;
        return (av < bv ? -1 : 1) * (asc ? 1 : -1);
      });
    }
    if (this.limitN != null) result = result.slice(0, this.limitN);
    const count = this.countOpt === "exact" ? result.length : null;
    if (this.headOnly) return { data: null, count, error: null };
    if (this.singleMode === "single") return { data: result[0] ?? null, count, error: result.length === 0 ? { message: "Not found" } : null };
    if (this.singleMode === "maybeSingle") return { data: result[0] ?? null, count, error: null };
    return { data: result, count, error: null };
  }
}

function buildAuth() {
  return {
    getUser: async () => ({
      data: {
        user: {
          id: "demo-user",
          email: "demo@rhodos.local",
          user_metadata: { display_name: "Giorgos A." },
        },
      },
    }),
    signOut: async () => ({ error: null }),
    signInWithPassword: async () => ({ error: null }),
    exchangeCodeForSession: async () => ({ error: null }),
  };
}

export function createDemoClient() {
  return {
    from: <T extends Row = Row>(table: string) => new QueryBuilder<T>(table),
    auth: buildAuth(),
  } as any;
}
