import { promises as fs } from "node:fs";
import path from "node:path";
import { Redis } from "@upstash/redis";

// Small key-value store with a lock. Upstash Redis when configured (production),
// otherwise JSON files under .data/ (local dev only; gitignored).

export interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Try to take a lock. Returns true if acquired. */
  lock(key: string, ttlSeconds: number): Promise<boolean>;
  unlock(key: string): Promise<void>;
}

class RedisKV implements KV {
  constructor(private r: Redis) {}
  async get(key: string) {
    const v = await this.r.get<string>(key);
    return v ?? null;
  }
  async set(key: string, value: string, ttlSeconds?: number) {
    if (ttlSeconds) await this.r.set(key, value, { ex: ttlSeconds });
    else await this.r.set(key, value);
  }
  async del(key: string) {
    await this.r.del(key);
  }
  async lock(key: string, ttlSeconds: number) {
    return (await this.r.set(`lock:${key}`, "1", { nx: true, ex: ttlSeconds })) === "OK";
  }
  async unlock(key: string) {
    await this.r.del(`lock:${key}`);
  }
}

type FileEntry = { value: string; expiresAt?: number };

class FileKV implements KV {
  private dir = path.join(process.cwd(), ".data");
  private locks = new Map<string, number>();

  private file(key: string) {
    return path.join(this.dir, `${key.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);
  }
  async get(key: string) {
    try {
      const e = JSON.parse(await fs.readFile(this.file(key), "utf8")) as FileEntry;
      if (e.expiresAt && e.expiresAt < Date.now()) return null;
      return e.value;
    } catch {
      return null;
    }
  }
  async set(key: string, value: string, ttlSeconds?: number) {
    await fs.mkdir(this.dir, { recursive: true });
    const entry: FileEntry = { value, expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined };
    const tmp = `${this.file(key)}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(entry), { mode: 0o600 });
    await fs.rename(tmp, this.file(key));
  }
  async del(key: string) {
    await fs.rm(this.file(key), { force: true });
  }
  async lock(key: string, ttlSeconds: number) {
    const held = this.locks.get(key);
    if (held && held > Date.now()) return false;
    this.locks.set(key, Date.now() + ttlSeconds * 1000);
    return true;
  }
  async unlock(key: string) {
    this.locks.delete(key);
  }
}

let kv: KV | null = null;

export function getKV(): KV {
  if (kv) return kv;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) kv = new RedisKV(new Redis({ url, token }));
  else if (process.env.VERCEL) throw new Error("Storage isn't configured: add Upstash Redis (UPSTASH_REDIS_REST_URL/TOKEN) in Vercel");
  else kv = new FileKV();
  return kv;
}
