import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseChangelog} from '../components/changelog-dialog';

test('the changelog reads cleanly: every release has a version, date and title, newest first',()=>{
 const md=readFileSync('CHANGELOG.md','utf8');const {title,blocks}=parseChangelog(md);
 assert.equal(title,'GRID OS — Changelog');
 const releases=blocks.filter(b=>b.kind==='h2'&&!/next up/i.test(b.text!)).map(b=>b.text!);
 assert.ok(releases.length>=5);
 for(const r of releases)assert.match(r,/^\d+\.\d+(\.\d+)? — .+ · .+$/,`"${r}" should look like "1.2 — 12 Oct · Title"`);
 const versions=releases.map(r=>r.split(' ')[0].split('.').map(Number));
 for(let i=1;i<versions.length;i++){const [a,b]=[versions[i-1],versions[i]];assert.ok(a[0]>b[0]||(a[0]===b[0]&&(a[1]>b[1]||(a[1]===b[1]&&(a[2]||0)>(b[2]||0)))),'newest release first');}
 // the newest release matches the app version
 const pkg=JSON.parse(readFileSync('package.json','utf8')).version.split('.').map(Number);
 assert.deepEqual(versions[0].slice(0,2),pkg.slice(0,2),'package.json version = latest changelog release');
});

test('nested lists, bold, code and links parse without HTML',()=>{
 const {blocks}=parseChangelog('# T\n\n## 1.0 — 1 Oct · X\n**Fixes**\n- one **bold** `code`\n  - nested [link](https://example.com)\n- two <b>not html</b>\n');
 const list=blocks.find(b=>b.kind==='list')!;
 assert.equal(list.items!.length,2);assert.equal(list.items![0].children[0].text,'nested [link](https://example.com)');
 assert.equal(list.items![1].text,'two <b>not html</b>','kept as plain text (React escapes it)');
});
