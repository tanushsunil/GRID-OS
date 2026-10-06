/** "Sign in with GRID": every person has a permanent six-digit GRID number, shown as e.g. 482 913. */
export const GRID_CODE_EXAMPLE='482 913';

/** The six digits from whatever was typed (spaces, dashes and a "GRID" prefix are ignored). Null if not six digits. */
export function normaliseGridCode(input:string){
 const digits=input.replace(/^\s*grid[\s\-:]*/i,'').replace(/[\s\-.]/g,'');
 return /^\d{6}$/.test(digits)?digits:null;
}

/** Display form: "482913" → "482 913". */
export const formatGridCode=(digits:string)=>`${digits.slice(0,3)} ${digits.slice(3)}`;
