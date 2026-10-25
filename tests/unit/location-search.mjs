import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync('src/lib/location-search.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
const { isSpecificLocation } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
assert.equal(isSpecificLocation('36301'), true, 'five-digit ZIP is accepted');
assert.equal(isSpecificLocation('Springfield'), false, 'duplicated town without a state is rejected');
assert.equal(isSpecificLocation('Springfield, IL'), true, 'state-qualified town is accepted');
assert.equal(isSpecificLocation('4469 Clinton Street, Marianna, FL'), true, 'street address is accepted');
console.log('PASS ZIP-first and state-qualified town lookup rules');