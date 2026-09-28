import { mkdir, writeFile } from 'node:fs/promises';
import { serviceConfig } from '../../../packages/contracts/src/service-config.ts';
const destination = new URL('../dist/', import.meta.url);
await mkdir(destination, { recursive: true });
await writeFile(new URL('service-config.json', destination), JSON.stringify(serviceConfig));
