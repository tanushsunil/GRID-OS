/** Login IDs: 3–30 lowercase letters, digits, dots, underscores or hyphens; starts and ends with a letter or digit. */
export const LOGIN_ID=/^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/;
export const normaliseLoginId=(v:string)=>v.trim().toLowerCase();
/** A sign-in identifier is an email when it contains "@", otherwise a login ID. */
export const isEmailLike=(v:string)=>v.includes('@');
