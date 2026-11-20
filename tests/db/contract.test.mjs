// Contrato cliente–servidor: cada supabase.rpc('nombre', { parametros }) de
// src/lib/api.ts debe existir en la base de datos con esos parámetros y ser
// ejecutable por usuarios autenticados.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TestDb } from './harness.mjs';

const db = new TestDb();
before(async () => { await db.start(); });
after(async () => { await db.stop(); });

test('todas las llamadas RPC de la app existen con los mismos parámetros', async () => {
  const src = readFileSync(new URL('../../src/lib/api.ts', import.meta.url), 'utf8');
  const calls = [...src.matchAll(/rpc<[^>]*>\('([a-z_]+)'(?:,\s*\{([^}]*)\})?\)|rpc\('([a-z_]+)'(?:,\s*\{([^}]*)\})?\)/gs)]
    .map((m) => ({ name: m[1] ?? m[3], keys: [...((m[2] ?? m[4] ?? '').matchAll(/(p_[a-z_]+)\s*:/g))].map((k) => k[1]) }));
  assert.ok(calls.length >= 20, `se esperaban >= 20 llamadas, hay ${calls.length}`);
  const admin = await db.admin();
  for (const c of calls) {
    const { rows } = await admin.query(
      `select p.proargnames, has_function_privilege('authenticated', p.oid, 'execute') as can_exec
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = $1`, [c.name]);
    assert.equal(rows.length, 1, `función ${c.name} no existe`);
    const args = rows[0].proargnames ?? [];
    for (const k of c.keys) assert.ok(args.includes(k), `${c.name}: parámetro ${k} no existe (tiene ${args})`);
    assert.ok(rows[0].can_exec, `${c.name} no es ejecutable por authenticated`);
  }
});
