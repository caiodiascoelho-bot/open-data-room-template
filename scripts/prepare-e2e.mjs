import {existsSync,readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {randomBytes} from "node:crypto";
import {spawnSync} from "node:child_process";
mkdirSync(".sites-runtime",{recursive:true});
if(!existsSync(".dev.vars"))writeFileSync(".dev.vars",`BETTER_AUTH_SECRET=${randomBytes(32).toString("hex")}\nBETTER_AUTH_URL=http://127.0.0.1:5173\nBOOTSTRAP_SECRET=${randomBytes(32).toString("hex")}\nINTEGRATION_SECRET=${randomBytes(32).toString("hex")}\n`,{mode:0o600});
const {entries}=JSON.parse(readFileSync("drizzle/meta/_journal.json","utf8"));
for(const entry of entries){
 const marker=entry.idx===0?".sites-runtime/local-migrated":`.sites-runtime/migrated-${entry.tag}`;
 if(existsSync(marker))continue;
 const r=spawnSync(process.execPath,["--import","./scripts/sites-env.mjs","./node_modules/wrangler/bin/wrangler.js","d1","execute","DB","--local","--config","dist/server/wrangler.json","--persist-to",".wrangler/state","--file",`drizzle/${entry.tag}.sql`],{stdio:"inherit"});
 if(r.status!==0)process.exit(r.status||1);
 writeFileSync(marker,"yes");
}
