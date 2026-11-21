import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(new URL('../azure/package.json', import.meta.url));
const { generateVAPIDKeys } = require('web-push');
const [group, app] = process.argv.slice(2);
if (!group || !app) throw new Error('Usage: node scripts/setup-azure-push.mjs <resource-group> <web-app>');
const target = ['--resource-group', group, '--name', app];
const temporary = mkdtempSync(join(tmpdir(), 'bingbingzero-push-'));

function az(args) {
  return execFileSync('az', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function privateFile(name, value) {
  const path = join(temporary, name);
  writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
  return `@${path}`;
}

try {
  const settings = Object.fromEntries(JSON.parse(az(['webapp', 'config', 'appsettings', 'list', ...target,
    '--query', "[?starts_with(name, 'PUSH_')]", '-o', 'json'])).map(({ name, value }) => [name, value]));
  if (Boolean(settings.PUSH_PUBLIC_KEY) !== Boolean(settings.PUSH_PRIVATE_KEY)) {
    throw new Error('Existing VAPID keys are incomplete');
  }
  const keys = settings.PUSH_PUBLIC_KEY
    ? { publicKey: settings.PUSH_PUBLIC_KEY, privateKey: settings.PUSH_PRIVATE_KEY }
    : generateVAPIDKeys();
  const dispatchKey = settings.PUSH_JOB_KEY || randomBytes(32).toString('base64url');
  const site = JSON.parse(az(['webapp', 'show', ...target, '--query', '{id:id,host:defaultHostName,location:location}', '-o', 'json']));
  const groupId = site.id.slice(0, site.id.toLowerCase().indexOf('/providers/'));
  const resource = `https://management.azure.com${groupId}/providers/Microsoft.Logic/workflows/${app}-push-demo`;
  const version = 'api-version=2019-05-01';
  const workflow = {
    location: site.location,
    properties: {
      state: 'Enabled',
      parameters: { dispatchKey: { value: dispatchKey } },
      definition: {
        $schema: 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
        contentVersion: '1.0.0.0',
        parameters: { dispatchKey: { type: 'SecureString' } },
        triggers: {
          Schedule_demo: {
            type: 'Request', kind: 'Http', inputs: {
              method: 'POST',
              schema: {
                type: 'object', required: ['id', 'startedAt'],
                properties: { id: { type: 'string' }, startedAt: { type: 'string' } },
              },
            },
          },
        },
        actions: {
          Repeat: {
            type: 'Foreach', foreach: '@range(1,6)', operationOptions: 'Sequential', runAfter: {},
            actions: {
              Wait_for_slot: {
                type: 'Wait', inputs: { until: { timestamp: "@addMinutes(triggerBody()?['startedAt'],mul(items('Repeat'),10))" } },
                runAfter: {},
              },
              Send: {
                type: 'Http',
                runAfter: { Wait_for_slot: ['Succeeded'] },
                inputs: {
                  method: 'POST', uri: `https://${site.host}/api/push/tick`,
                  headers: { Authorization: "@concat('Bearer ',parameters('dispatchKey'))", 'Content-Type': 'application/json' },
                  body: { id: "@triggerBody()?['id']", sequence: "@items('Repeat')" },
                  retryPolicy: { type: 'fixed', count: 2, interval: 'PT10S' },
                },
                runtimeConfiguration: { secureData: { properties: ['inputs', 'outputs'] } },
              },
            },
          },
        },
        outputs: {},
      },
    },
  };
  az(['rest', '--method', 'put', '--url', `${resource}?${version}`, '--body', privateFile('workflow.json', workflow), '-o', 'none']);
  const callback = az(['rest', '--method', 'post', '--url',
    `${resource}/triggers/Schedule_demo/listCallbackUrl?${version}`, '--query', 'value', '-o', 'tsv']);
  if (!callback.startsWith('https://')) throw new Error('Invalid scheduler callback');
  az(['webapp', 'config', 'appsettings', 'set', ...target, '--settings', privateFile('settings.json', {
    PUSH_PUBLIC_KEY: keys.publicKey, PUSH_PRIVATE_KEY: keys.privateKey,
    PUSH_WORKFLOW_URL: callback, PUSH_JOB_KEY: dispatchKey,
  }), '-o', 'none']);
  console.log('Azure push scheduler and app settings configured.');
} catch (error) {
  if (error.status !== undefined) {
    const detail = String(error.stderr ?? '').match(/\b(?:AuthorizationFailed|InvalidTemplate|InvalidRequestContent|BadRequest|RegionNotSupported|MissingSubscriptionRegistration|RequestDisallowedByPolicy|ResourceNotFound|SubscriptionNotRegistered)\b/)?.[0];
    throw new Error(`Azure command failed with status ${error.status}${detail ? ` (${detail})` : ''}`);
  }
  throw error;
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
