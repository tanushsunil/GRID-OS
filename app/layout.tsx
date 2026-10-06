import type {Metadata} from 'next';
import localFont from 'next/font/local';
import {cookies} from 'next/headers';
import './globals.css';
import GlassCursor from '@/components/glass-cursor';
const sfPro=localFont({src:[{path:'./fonts/SF-Pro-Display-Regular.otf',weight:'400',style:'normal'},{path:'./fonts/SF-Pro-Display-Medium.otf',weight:'500',style:'normal'},{path:'./fonts/SF-Pro-Display-Bold.otf',weight:'700',style:'normal'}],variable:'--font-sf-pro',display:'swap'});
export const metadata:Metadata={title:'GRID OS — Agency workspace',description:'Projects, production and delivery. One connected agency workspace.'};
export default async function RootLayout({children}:{children:React.ReactNode}){const prefs=await cookies();return <html lang="en" className={sfPro.variable} data-theme={prefs.get('grid-theme')?.value==='dark'?'dark':undefined} data-glass={prefs.get('grid-glass')?.value==='off'?'off':undefined} data-sidebar={prefs.get('grid-sidebar')?.value==='collapsed'?'collapsed':undefined} data-cursor={prefs.get('grid-cursor')?.value==='off'?'off':undefined} suppressHydrationWarning><body>{children}<GlassCursor/></body></html>;}
