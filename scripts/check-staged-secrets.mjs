import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const git = (...args) => execFileSync('git', args, { maxBuffer: 32 * 1024 * 1024 });
const files = git('ls-files', '-z').toString().split('\0').filter(Boolean);
const sources = ['staticdata/.env.local', '.dev.vars', '.env', '.env.local'];
const secrets = new Set(sources.filter(existsSync).flatMap((file) =>
  Object.values(parseEnv(readFileSync(file, 'utf8'))).filter((value) => value.length >= 6),
));
const violations = files.filter((file) => {
  if (/(^|\/)(?:\.env[^/]*|[^/]*\.env(?:\.[^/]*)?|\.dev\.vars[^/]*|[^/]+\.(?:pem|key|p12|pfx))$/i.test(file)) return true;
  const content = git('show', `:${file}`);
  return [...secrets].some((value) => content.includes(value));
});
if (violations.length) {
  console.error(`Credential check failed for ${violations.length} staged path(s). Review locally.`);
  process.exitCode = 1;
} else {
  console.log(`Credential check passed for ${files.length} Git index paths.`);
}
