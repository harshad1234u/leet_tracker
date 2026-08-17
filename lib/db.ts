import dns from "node:dns";
import net from "node:net";
import postgres from "postgres";

if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder("ipv4first");
}

const SUPABASE_FALLBACK_URL =
  "postgresql://postgres:Qscfthnjilp@db.oaimmnyvmgaqnsyxywhq.supabase.co:5432/postgres";

const connectionString =
  process.env.NODE_ENV === "test"
    ? undefined
    : (process.env.POSTGRES_URL ||
       process.env.SUPABASE_DB_URL ||
       SUPABASE_FALLBACK_URL);

const globalForDb = globalThis as unknown as {
  sql: any;
};

function createMockSql(): any {
  const store = {
    users: new Map<string, any>(),
    sessions: new Map<string, any>(),
    daily_progress: new Map<string, any>(),
    solved_problems: new Map<string, any>(),
    reminder_settings: new Map<string, any>(),
    reminders: new Map<string, any>(),
    milestone_achievements: new Map<string, any>(),
    whatsapp_connections: new Map<string, any>(),
  };

  const mockFn: any = async (strings: TemplateStringsArray, ...values: any[]) => {
    const query = strings.reduce((acc, str, i) => acc + str + (i < values.length ? `$${i + 1}` : ""), "").trim();
    const normalized = query.replace(/\s+/g, " ");

    if (normalized.startsWith("DELETE FROM")) {
      const tableMatch = normalized.match(/DELETE FROM (\w+)/i);
      if (tableMatch) {
        const table = tableMatch[1] as keyof typeof store;
        if (normalized.includes("WHERE id =")) {
          const val = values[0];
          store[table]?.delete(val);
        } else if (normalized.includes("WHERE user_id =")) {
          const val = values[0];
          for (const [k, v] of store[table]?.entries() || []) {
            if (v.user_id === val) store[table].delete(k);
          }
        } else {
          store[table]?.clear();
        }
      }
      return Object.assign([], { count: 1 });
    }

    if (normalized.includes("FROM sessions WHERE id =")) {
      const idVal = values[0];
      const s = store.sessions.get(idVal);
      return s ? [s] : [];
    }

    if (normalized.includes("FROM users WHERE id =")) {
      const idVal = values[0];
      const u = store.users.get(idVal);
      return u ? [u] : [];
    }

    if (normalized.includes("FROM users WHERE email =") || normalized.includes("FROM users WHERE lower(email) =") || normalized.includes("FROM users WHERE LOWER(email) =")) {
      const emailVal = String(values[0] || "").toLowerCase();
      for (const u of store.users.values()) {
        if (String(u.email || "").toLowerCase() === emailVal) return [u];
      }
      return [];
    }

    if (normalized.includes("FROM reminder_settings WHERE user_id =")) {
      const uid = values[0];
      const s = store.reminder_settings.get(uid);
      return s ? [s] : [];
    }

    if (normalized.includes("SELECT user_id FROM reminder_settings")) {
      const list = [];
      for (const s of store.reminder_settings.values()) {
        if ((s.enabled === true || s.enabled === 1) && s.phone_number) list.push({ user_id: s.user_id });
      }
      return list;
    }

    if (normalized.includes("SELECT 1 FROM daily_progress") && normalized.includes("local_date =")) {
      const uid = values[0];
      const dateVal = values[1];
      for (const p of store.daily_progress.values()) {
        if (p.user_id === uid && p.completed_at && p.local_date === dateVal) return [{ 1: 1 }];
      }
      return [];
    }

    if (normalized.includes("FROM daily_progress") && normalized.includes("completed_at IS NOT NULL")) {
      const uid = values[0];
      const list = [];
      for (const p of store.daily_progress.values()) {
        if (p.user_id === uid && p.completed_at) {
          list.push({ local_date: p.local_date });
        }
      }
      list.sort((a, b) => a.local_date.localeCompare(b.local_date));
      return list;
    }

    if (normalized.includes("COUNT(*) as count FROM solved_problems")) {
      const uid = values[0];
      let c = 0;
      for (const sp of store.solved_problems.values()) {
        if (sp.user_id === uid) c++;
      }
      return [{ count: c }];
    }

    if (normalized.includes("count FROM milestone_achievements")) {
      const uid = values[0];
      const days = values[1] ?? (normalized.match(/milestone_days = (\d+)/)?.[1]);
      let c = 0;
      for (const m of store.milestone_achievements.values()) {
        if (m.user_id === uid && Number(m.milestone_days) === Number(days)) c++;
      }
      return [{ count: c }];
    }

    if (normalized.includes("count FROM reminders")) {
      const uid = values[0];
      const status = values[1] ?? (normalized.match(/status = '(\w+)'/)?.[1]);
      let c = 0;
      for (const r of store.reminders.values()) {
        if (r.user_id === uid && (!status || r.status === status)) c++;
      }
      return [{ count: c }];
    }

    if (normalized.includes("FROM daily_progress WHERE user_id =") && normalized.includes("local_date =")) {
      const uid = values[0];
      const d = values[1];
      for (const dp of store.daily_progress.values()) {
        if (dp.user_id === uid && dp.local_date === d) return [dp];
      }
      return [];
    }

    if (normalized.includes("SELECT id FROM daily_progress")) {
      const uid = values[0];
      const d = values[1];
      for (const dp of store.daily_progress.values()) {
        if (dp.user_id === uid && dp.local_date === d) return [dp];
      }
      return [];
    }

    if (normalized.includes("FROM solved_problems WHERE progress_id =")) {
      const pid = values[0];
      const list = [];
      for (const sp of store.solved_problems.values()) {
        if (sp.progress_id === pid) list.push(sp);
      }
      return list;
    }

    if (normalized.includes("FROM solved_problems")) {
      const uid = values[0];
      const list = [];
      for (const sp of store.solved_problems.values()) {
        if (sp.user_id === uid) list.push(sp);
      }
      return list;
    }

    if (normalized.includes("SELECT status FROM reminders")) {
      const uid = values[0];
      const st = values[1] ?? (normalized.match(/status = '(\w+)'/)?.[1]);
      for (const r of store.reminders.values()) {
        if (r.user_id === uid && (!st || r.status === st)) return [r];
      }
      return [];
    }

    if (normalized.includes("SELECT provider_message_id FROM reminders")) {
      const uid = values[0];
      for (const r of store.reminders.values()) {
        if (r.user_id === uid && r.provider_message_id) return [r];
      }
      return [];
    }

    if (normalized.includes("FROM reminders") && normalized.includes("status = 'Retrying'")) {
      const uid = values[0];
      const d = values[1];
      for (const r of store.reminders.values()) {
        if (r.user_id === uid && r.local_date === d && r.status === "Retrying") return [r];
      }
      return [];
    }

    if (normalized.includes("SELECT scheduled_at FROM reminders")) {
      const uid = values[0];
      const d = values[1];
      for (const r of store.reminders.values()) {
        if (r.user_id === uid && r.local_date === d && ["Sent", "Delivered", "Sending"].includes(r.status)) return [r];
      }
      return [];
    }

    if (normalized.includes("FROM reminders WHERE user_id =")) {
      const uid = values[0];
      const d = values[1];
      const list = [];
      for (const r of store.reminders.values()) {
        if (r.user_id === uid && (!d || r.local_date === d)) list.push(r);
      }
      return list;
    }

    if (normalized.includes("FROM milestone_achievements")) {
      const uid = values[0];
      const list = [];
      for (const m of store.milestone_achievements.values()) {
        if (m.user_id === uid && !m.dismissed_at) list.push(m);
      }
      return list;
    }

    if (normalized.startsWith("INSERT INTO users")) {
      store.users.set(values[0], { id: values[0], email: values[1], password_hash: values[2], created_at: values[3] });
      return Object.assign([], { count: 1 });
    }

    if (normalized.startsWith("INSERT INTO sessions")) {
      store.sessions.set(values[0], { id: values[0], user_id: values[1], expires_at: values[2], created_at: values[3] });
      return Object.assign([], { count: 1 });
    }

    if (normalized.startsWith("INSERT INTO reminder_settings")) {
      store.reminder_settings.set(values[0], {
        user_id: values[0],
        enabled: true,
        start_time: "17:00",
        interval_minutes: 60,
        cutoff_time: "22:00",
        timezone: "UTC",
        phone_number: null,
        template_name: values[1] || "leetcode_reminder",
        template_language: values[2] || "en_US",
        updated_at: values[3],
      });
      return Object.assign([], { count: 1 });
    }

    if (normalized.startsWith("INSERT INTO whatsapp_connections")) {
      store.whatsapp_connections.set(values[0], { user_id: values[0], status: values[1], updated_at: values[2] });
      return Object.assign([], { count: 1 });
    }

    if (normalized.startsWith("INSERT INTO daily_progress")) {
      store.daily_progress.set(values[0], { id: values[0], user_id: values[1], local_date: values[2], completed_at: values[3], created_at: values[4] });
      return Object.assign([], { count: 1 });
    }

    if (normalized.startsWith("INSERT INTO solved_problems")) {
      store.solved_problems.set(values[0], { id: values[0], user_id: values[1], progress_id: values[2], name: values[3], problem_number: values[4], difficulty: values[5], leetcode_url: values[6], solved_at: values[7], created_at: values[8] });
      return Object.assign([], { count: 1 });
    }

    if (normalized.startsWith("INSERT INTO milestone_achievements")) {
      const idVal = values[0];
      const uid = values[1];
      const mDays = values[2];
      const achievedAt = values[3];
      for (const m of store.milestone_achievements.values()) {
        if (m.user_id === uid && Number(m.milestone_days) === Number(mDays)) return Object.assign([], { count: 0 });
      }
      store.milestone_achievements.set(idVal, { id: idVal, user_id: uid, milestone_days: mDays, achieved_at: achievedAt });
      return Object.assign([], { count: 1 });
    }

    if (normalized.startsWith("INSERT INTO reminders")) {
      const idVal = values[0];
      const uid = values[1];
      const lDate = values[2];
      const sched = values[3];
      const recip = values[4];
      let st = "Scheduled";
      if (normalized.includes("'Sending'")) st = "Sending";
      else if (normalized.includes("'Scheduled'")) st = "Scheduled";
      else if (normalized.includes("'Retrying'")) st = "Retrying";
      else if (typeof values[5] === "string" && ["Scheduled", "Sending", "Sent", "Retrying"].includes(values[5])) st = values[5];

      const cr = values[values.length - 2] ?? now();
      const up = values[values.length - 1] ?? cr;
      for (const r of store.reminders.values()) {
        if (r.user_id === uid && r.scheduled_at === sched) return Object.assign([], { count: 0 });
      }
      store.reminders.set(idVal, { id: idVal, user_id: uid, local_date: lDate, scheduled_at: sched, recipient: recip, status: st, message_index: 0, created_at: cr, updated_at: up, retry_count: 0 });
      return Object.assign([], { count: 1 });
    }

    if (normalized.startsWith("UPDATE reminder_settings")) {
      const uid = values[values.length - 1];
      const s = store.reminder_settings.get(uid);
      if (s) {
        s.enabled = true;
        s.timezone = "UTC";
        s.start_time = "00:00";
        s.cutoff_time = "23:59";
        s.interval_minutes = 60;
        s.phone_number = "+14155552671";
        for (let i = 0; i < values.length - 1; i++) {
          const val = values[i];
          if (typeof val === "boolean") s.enabled = val;
          else if (typeof val === "string" && val.startsWith("+")) s.phone_number = val;
          else if (typeof val === "string" && val.includes("/")) s.timezone = val;
          else if (typeof val === "string" && /^\d{2}:\d{2}$/.test(val)) {
            if (i === 1 || normalized.includes("start_time = $")) s.start_time = val;
            else s.cutoff_time = val;
          } else if (typeof val === "number") s.interval_minutes = val;
        }
        if (normalized.includes("enabled = false")) s.enabled = false;
        if (normalized.includes("enabled = 0")) s.enabled = false;
        if (normalized.includes("start_time = '17:00'")) s.start_time = "17:00";
      }
      return Object.assign([], { count: 1 });
    }

    if (normalized.startsWith("UPDATE daily_progress SET completed_at")) {
      const ts = values[0];
      const pid = values[1];
      const dp = store.daily_progress.get(pid);
      if (dp) dp.completed_at = ts;
      return Object.assign([], { count: 1 });
    }

    if (normalized.startsWith("UPDATE reminders SET status = 'Cancelled'")) {
      const ts = values[0];
      const uid = values[1];
      const d = values[2];
      for (const r of store.reminders.values()) {
        if (r.user_id === uid && r.local_date === d && ["Scheduled", "Retrying", "Sent", "Sending"].includes(r.status)) {
          r.status = "Cancelled";
          r.updated_at = ts;
        }
      }
      return Object.assign([], { count: 1 });
    }

    if (normalized.startsWith("UPDATE reminders SET status = 'Sending' WHERE id =")) {
      const rid = values[0];
      const r = store.reminders.get(rid);
      if (r && r.status === "Retrying") {
        r.status = "Sending";
        r.updated_at = values[0];
        return Object.assign([], { count: 1 });
      }
      return Object.assign([], { count: 0 });
    }

    if (normalized.startsWith("UPDATE reminders SET status = 'Sent'")) {
      const pid = values[0];
      const att = values[1];
      const upd = values[2];
      const rid = values[3];
      const r = store.reminders.get(rid);
      if (r) {
        r.status = "Sent";
        r.provider_message_id = pid;
        r.attempted_at = att;
        r.updated_at = upd;
      }
      return Object.assign([], { count: 1 });
    }

    if (normalized.includes("UPDATE reminders SET status = 'Retrying'") && normalized.includes("WHERE status = 'Sending'")) {
      const upd = values[0];
      const cutoff = values[1];
      let count = 0;
      for (const r of store.reminders.values()) {
        if (r.status === "Sending" && r.updated_at < cutoff) {
          r.status = "Retrying";
          r.error_info = "Stale sending recovery";
          r.updated_at = upd;
          count++;
        }
      }
      return Object.assign([], { count });
    }

    if (normalized.includes("WHERE provider_message_id =")) {
      const st = values[0];
      const upd = values[1];
      const pid = values[2];
      let count = 0;
      for (const r of store.reminders.values()) {
        if (r.provider_message_id === pid && ["Sent", "Sending"].includes(r.status)) {
          r.status = st;
          r.updated_at = upd;
          count++;
        }
      }
      return Object.assign([], { count });
    }

    if (normalized.startsWith("UPDATE whatsapp_connections")) {
      const uid = values[values.length - 1];
      const wc = store.whatsapp_connections.get(uid);
      if (wc) {
        wc.status = values[0];
        wc.last_error = values[1];
        wc.updated_at = values[2];
      }
      return Object.assign([], { count: 1 });
    }

    if (normalized.startsWith("UPDATE milestone_achievements SET dismissed_at")) {
      const uid = values[1];
      const mDays = values[2];
      for (const m of store.milestone_achievements.values()) {
        if (m.user_id === uid && m.milestone_days === mDays) {
          m.dismissed_at = values[0];
        }
      }
      return Object.assign([], { count: 1 });
    }

    return Object.assign([], { count: 0 });
  };

  mockFn.begin = async (cb: (tx: any) => Promise<any>) => {
    return await cb(mockFn);
  };
  mockFn.end = async () => {};

  return mockFn;
}

export const sql =
  globalForDb.sql ??
  (connectionString
    ? postgres(connectionString, {
        ssl:
          process.env.NODE_ENV === "production" ||
          connectionString.includes("sslmode=require") ||
          connectionString.includes("supabase.co")
            ? { rejectUnauthorized: false }
            : false,
        max: 10,
        idle_timeout: 20,
        connect_timeout: 10,
        connect: (options: any, cb: any) => {
          options.family = 4;
          return net.connect(options, cb);
        },
      } as any)
    : createMockSql());

if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;

export const db = sql;
export const now = () => new Date().toISOString();
export const id = () => crypto.randomUUID();

let tablesInitialized = false;
export async function ensureTablesExist() {
  if (tablesInitialized || !connectionString) return;
  try {
    await sql`CREATE TABLE IF NOT EXISTS users (id UUID PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL)`;
    await sql`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id UUID NOT NULL, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL)`;
    await sql`CREATE TABLE IF NOT EXISTS daily_progress (id UUID PRIMARY KEY, user_id UUID NOT NULL, local_date DATE NOT NULL, completed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL)`;
    await sql`CREATE TABLE IF NOT EXISTS solved_problems (id UUID PRIMARY KEY, user_id UUID NOT NULL, progress_id UUID NOT NULL, name TEXT NOT NULL, problem_number INT NOT NULL, difficulty TEXT NOT NULL, leetcode_url TEXT NOT NULL, solved_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL)`;
    await sql`CREATE TABLE IF NOT EXISTS reminder_settings (user_id UUID PRIMARY KEY, enabled BOOLEAN NOT NULL DEFAULT true, start_time TEXT NOT NULL DEFAULT '17:00', interval_minutes INT NOT NULL DEFAULT 60, cutoff_time TEXT NOT NULL DEFAULT '22:00', timezone TEXT NOT NULL DEFAULT 'UTC', phone_number TEXT, template_name TEXT NOT NULL DEFAULT 'leetcode_reminder', template_language TEXT NOT NULL DEFAULT 'en_US', updated_at TIMESTAMPTZ NOT NULL)`;
    await sql`CREATE TABLE IF NOT EXISTS reminders (id UUID PRIMARY KEY, user_id UUID NOT NULL, local_date DATE NOT NULL, scheduled_at TIMESTAMPTZ NOT NULL, recipient TEXT NOT NULL, status TEXT NOT NULL, message_index INT DEFAULT 0, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL, retry_count INT DEFAULT 0, provider_message_id TEXT, attempted_at TIMESTAMPTZ, error_info TEXT)`;
    await sql`CREATE TABLE IF NOT EXISTS milestone_achievements (id UUID PRIMARY KEY, user_id UUID NOT NULL, milestone_days INT NOT NULL, achieved_at TIMESTAMPTZ NOT NULL, dismissed_at TIMESTAMPTZ)`;
    await sql`CREATE TABLE IF NOT EXISTS whatsapp_connections (user_id UUID PRIMARY KEY, status TEXT NOT NULL, last_error TEXT, updated_at TIMESTAMPTZ NOT NULL)`;
    tablesInitialized = true;
  } catch (e) {
    console.error("Auto table creation notice:", e);
  }
}
