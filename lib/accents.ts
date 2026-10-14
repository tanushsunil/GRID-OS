/** Accent colour choices per section. The first option of each section is its original colour (the default).
 *  Chosen in Settings, stored in a `grid-accent-<section>` cookie and applied as `data-accent-<section>` on <html>;
 *  the colours themselves live in globals.css ("Accent choices"). */
export type AccentSection='production'|'finance'|'data';
export type AccentOption={id:string;label:string;light:string;dark:string};
export const ACCENTS:Record<AccentSection,AccentOption[]>={
 production:[
  {id:'orange',label:'Orange',light:'#e2560d',dark:'#ff9d5c'},
  {id:'terracotta',label:'Terracotta',light:'#b5603f',dark:'#e39a7c'},
  {id:'violet',label:'Soft violet',light:'#6553c9',dark:'#a99bff'},
 ],
 finance:[
  {id:'green',label:'Green',light:'#11845a',dark:'#4fd29b'},
  {id:'teal',label:'Teal',light:'#0f7a80',dark:'#5fcfd4'},
  {id:'sage',label:'Sage',light:'#4f7d5b',dark:'#9cc9a6'},
 ],
 data:[
  {id:'blue',label:'Blue',light:'#2563c9',dark:'#78a9ff'},
  {id:'indigo',label:'Indigo',light:'#4453c4',dark:'#98a4ff'},
  {id:'slate',label:'Slate',light:'#4c6888',dark:'#a7bcd6'},
 ],
};
export const ACCENT_SECTIONS:AccentSection[]=['production','finance','data'];
export const accentCookie=(s:AccentSection)=>`grid-accent-${s}`;
/** A saved choice, or the section's default if it's missing or no longer offered. */
export const validAccent=(s:AccentSection,v?:string|null)=>ACCENTS[s].some(o=>o.id===v)?v!:ACCENTS[s][0].id;
