import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { expect, test } from "vitest";

test("Always migration preserves existing investor credentials and sessions", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys=ON");
    for (const file of ["0000_nappy_snowbird", "0001_burly_mephistopheles", "0002_bent_gambit"])
      db.exec(readFileSync(`drizzle/${file}.sql`, "utf8"));
    db.exec(`INSERT INTO shares(id,token_hash,password_hash,code_lookup,label,expires_at,created_at,created_by)
      VALUES('existing','token-hash','password-hash','code-hash','Existing investor','2030-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z','admin');
      INSERT INTO viewers(id,session_hash,share_id,name,email,expires_at,created_at)
      VALUES('viewer','session-hash','existing','Investor','investor@example.test','2030-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z');`);
    const shares = db.prepare("SELECT * FROM shares").all();
    const viewers = db.prepare("SELECT * FROM viewers").all();
    db.exec(readFileSync("drizzle/0003_always_investor_password.sql", "utf8"));
    expect(db.prepare("SELECT * FROM shares").all()).toEqual(
      shares.map((share) => ({ ...share, never_expires: 0 })),
    );
    expect(db.prepare("SELECT * FROM viewers").all()).toEqual(viewers);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally {
    db.close();
  }
});
