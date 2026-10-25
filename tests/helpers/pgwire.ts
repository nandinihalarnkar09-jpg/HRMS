/**
 * Minimal PostgreSQL wire-protocol client used ONLY by the integration tests
 * (so they run on plain Node with zero npm dependencies, e.g. in CI or a sandbox).
 * Production uses postgres.js (lib/db/client.ts). Both return identical shapes:
 *   date → 'YYYY-MM-DD', numeric/int8 → number, timestamptz → Date, jsonb → object.
 * Supports trust/cleartext auth only, which is fine for a local test database.
 */
import net from 'node:net';
import type { Db, Queryable } from '../../lib/db/types';

type Field = { name: string; oid: number };
export class PgError extends Error {
  code?: string; detail?: string; constraint_name?: string;
}

function parseArray(s: string, el: (x: string) => unknown): unknown[] {
  const inner = s.slice(1, -1);
  if (!inner) return [];
  return inner.split(',').map((x) => (x === 'NULL' ? null : el(x.replace(/^"|"$/g, ''))));
}

function parseValue(oid: number, v: string): unknown {
  switch (oid) {
    case 16: return v === 't';
    case 20: case 21: case 23: case 700: case 701: case 1700: return Number(v);
    case 1082: return v; // date stays a string
    case 1114: case 1184: return new Date(v.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00'));
    case 114: case 3802: return JSON.parse(v);
    case 17: return Buffer.from(v.slice(2), 'hex');
    case 1005: case 1007: case 1016: case 1231: return parseArray(v, Number);
    case 1009: case 1015: case 2951: return parseArray(v, (x) => x);
    default: return v;
  }
}

function serialize(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (Buffer.isBuffer(v)) return '\\x' + v.toString('hex');
  if (Array.isArray(v)) return '{' + v.map((x) => (x === null ? 'NULL' : `"${String(x).replace(/"/g, '\\"')}"`)).join(',') + '}';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

class Conn {
  private sock!: net.Socket;
  private buf = Buffer.alloc(0);
  private waiters: ((b: Buffer) => void)[] = [];
  private queue: Promise<unknown> = Promise.resolve();

  async open(url: string) {
    const u = new URL(url);
    await new Promise<void>((res, rej) => {
      this.sock = net.connect(Number(u.port || 5432), u.hostname, () => res());
      this.sock.once('error', rej);
    });
    this.sock.on('data', (d: Buffer | string) => { this.buf = Buffer.concat([this.buf, typeof d === 'string' ? Buffer.from(d) : d]); this.pump(); });
    const params = ['user', decodeURIComponent(u.username || 'postgres'), 'database', u.pathname.slice(1) || 'postgres', 'TimeZone', 'Asia/Kolkata', 'client_encoding', 'UTF8'];
    const body = Buffer.concat([Buffer.from([0, 3, 0, 0]), ...params.map((p) => Buffer.from(p + '\0')), Buffer.from([0])]);
    const len = Buffer.alloc(4); len.writeInt32BE(body.length + 4);
    this.sock.write(Buffer.concat([len, body]));
    for (;;) {
      const m = await this.next();
      const t = String.fromCharCode(m[0]);
      if (t === 'R') {
        const code = m.readInt32BE(5);
        if (code === 3) this.send('p', Buffer.from(decodeURIComponent(u.password) + '\0'));
        else if (code !== 0) throw new Error(`Unsupported auth method ${code} (use trust auth for the test DB)`);
      } else if (t === 'E') throw this.err(m);
      else if (t === 'Z') break;
    }
  }

  private pump() {
    while (this.buf.length >= 5 && this.waiters.length) {
      const len = this.buf.readInt32BE(1);
      if (this.buf.length < len + 1) return;
      const msg = this.buf.subarray(0, len + 1);
      this.buf = this.buf.subarray(len + 1);
      this.waiters.shift()!(msg);
    }
  }
  private next(): Promise<Buffer> { return new Promise((r) => { this.waiters.push(r); this.pump(); }); }
  private send(type: string, body: Buffer) {
    const h = Buffer.alloc(5); h.write(type, 0); h.writeInt32BE(body.length + 4, 1);
    this.sock.write(Buffer.concat([h, body]));
  }
  private err(m: Buffer): PgError {
    const f: Record<string, string> = {};
    let i = 5;
    while (m[i] !== 0) { const k = String.fromCharCode(m[i]); const e = m.indexOf(0, i + 1); f[k] = m.toString('utf8', i + 1, e); i = e + 1; }
    const e = new PgError(f.M); e.code = f.C; e.detail = f.D; e.constraint_name = f.n; return e;
  }

  /** Simple-query protocol: multiple statements, no params (migrations). */
  exec(sqlText: string): Promise<void> {
    const run = async () => {
      this.send('Q', Buffer.from(sqlText + '\0'));
      let error: PgError | null = null;
      for (;;) { const m = await this.next(); const t = String.fromCharCode(m[0]); if (t === 'E') error = this.err(m); if (t === 'Z') break; }
      if (error) throw error;
    };
    const p = this.queue.then(run, run); this.queue = p.catch(() => undefined); return p;
  }

  query<T>(text: string, params: unknown[] = []): Promise<T[]> {
    const run = async () => {
      const i16 = (n: number) => { const b = Buffer.alloc(2); b.writeInt16BE(n); return b; };
      const i32 = (n: number) => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };
      this.send('P', Buffer.concat([Buffer.from('\0' + text + '\0'), i16(0)]));
      const vals = params.map(serialize);
      this.send('B', Buffer.concat([Buffer.from('\0\0'), i16(0), i16(vals.length),
        ...vals.flatMap((v) => (v === null ? [i32(-1)] : [i32(Buffer.byteLength(v)), Buffer.from(v)])), i16(0)]));
      this.send('D', Buffer.from('P\0'));
      this.send('E', Buffer.concat([Buffer.from('\0'), i32(0)]));
      this.send('S', Buffer.alloc(0));
      let fields: Field[] = [];
      const rows: T[] = [];
      let error: PgError | null = null;
      for (;;) {
        const m = await this.next();
        const t = String.fromCharCode(m[0]);
        if (t === 'T') {
          const n = m.readInt16BE(5); let i = 7; fields = [];
          for (let k = 0; k < n; k++) { const e = m.indexOf(0, i); const name = m.toString('utf8', i, e); i = e + 1; const oid = m.readInt32BE(i + 6); i += 18; fields.push({ name, oid }); }
        } else if (t === 'D') {
          const n = m.readInt16BE(5); let i = 7; const row: Record<string, unknown> = {};
          for (let k = 0; k < n; k++) { const len = m.readInt32BE(i); i += 4; if (len === -1) row[fields[k].name] = null; else { row[fields[k].name] = parseValue(fields[k].oid, m.toString('utf8', i, i + len)); i += len; } }
          rows.push(row as T);
        } else if (t === 'E') error = this.err(m);
        else if (t === 'Z') break;
      }
      if (error) throw error;
      return rows;
    };
    const p = this.queue.then(run, run); this.queue = p.catch(() => undefined); return p as Promise<T[]>;
  }

  close() { this.sock.end(); }
}

/** A small pool: plain queries share one connection; each transaction gets its own. */
export async function createTestDb(url: string): Promise<Db & { exec(sql: string): Promise<void>; close(): Promise<void> }> {
  const main = new Conn(); await main.open(url);
  const spare: Conn[] = [];
  const all: Conn[] = [main];
  const acquire = async () => { const c = spare.pop(); if (c) return c; const n = new Conn(); await n.open(url); all.push(n); return n; };
  return {
    query: (t, p) => main.query(t, p),
    exec: (s) => main.exec(s),
    async tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T> {
      const c = await acquire();
      await c.query('begin');
      try {
        const r = await fn({ query: (t, p) => c.query(t, p) });
        await c.query('commit');
        return r;
      } catch (e) {
        await c.query('rollback').catch(() => undefined);
        throw e;
      } finally { spare.push(c); }
    },
    async close() { all.forEach((c) => c.close()); },
  };
}
