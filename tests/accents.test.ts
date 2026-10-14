import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ACCENTS,ACCENT_SECTIONS,validAccent} from '../lib/accents';

test('every accent choice has light and dark colours in the stylesheet',()=>{
 const css=readFileSync('app/globals.css','utf8');
 for(const s of ACCENT_SECTIONS)for(const o of ACCENTS[s].slice(1))for(const theme of ['light','dark']){
  const rules=css.split('}').filter(r=>r.includes(`:root[data-theme=${theme}][data-accent-${s}=${o.id}]`));
  assert.ok(rules.some(r=>r.includes(`--mod-${s}:`)),`${s}/${o.id} ${theme}: sidebar colour`);
  assert.ok(rules.some(r=>r.includes('--accent:')&&r.includes('--primary:')&&r.includes('--glow-1:')),`${s}/${o.id} ${theme}: section colours`);
 }
});

test('a missing or retired choice falls back to the original colour',()=>{
 assert.equal(validAccent('production','violet'),'violet');
 assert.equal(validAccent('production','neon'),'orange');
 assert.equal(validAccent('finance',undefined),'green');
});
