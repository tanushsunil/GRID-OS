import type {Metadata,Viewport} from 'next';
import localFont from 'next/font/local';
import {Archivo} from 'next/font/google';
import {cookies} from 'next/headers';
import './globals.css';
import GlassCursor from '@/components/glass-cursor';
import {PwaSetup} from '@/components/install-app';
import {ACCENT_SECTIONS,accentCookie,validAccent} from '@/lib/accents';
const sfPro=localFont({src:[{path:'./fonts/SF-Pro-Display-Regular.woff2',weight:'400',style:'normal'},{path:'./fonts/SF-Pro-Display-Medium.woff2',weight:'500',style:'normal'},{path:'./fonts/SF-Pro-Display-Bold.woff2',weight:'700',style:'normal'}],variable:'--font-sf-pro',display:'swap'});
// The GRID wordmark, as on the GRID website: Archivo, extra-wide (wdth 125)
const archivo=Archivo({subsets:['latin'],axes:['wdth'],variable:'--font-wordmark',display:'swap'});
export const metadata:Metadata={title:'GRID OS — Agency workspace',description:'Projects, production and delivery. One connected agency workspace.',applicationName:'GRID OS',appleWebApp:{capable:true,title:'GRID OS',statusBarStyle:'black-translucent'},icons:{icon:'/icon.svg',apple:'/apple-icon.png'}};
export const viewport:Viewport={themeColor:'#000000',viewportFit:'cover'};
export default async function RootLayout({children}:{children:React.ReactNode}){const prefs=await cookies();return <html lang="en" className={`${sfPro.variable} ${archivo.variable}`} data-theme={prefs.get('grid-theme')?.value==='light'?'light':'dark'} data-glass={prefs.get('grid-glass')?.value==='off'?'off':undefined} data-sidebar={prefs.get('grid-sidebar')?.value==='collapsed'?'collapsed':undefined} data-cursor={prefs.get('grid-cursor')?.value==='on'?'on':'off'} {...Object.fromEntries(ACCENT_SECTIONS.map(x=>[`data-accent-${x}`,validAccent(x,prefs.get(accentCookie(x))?.value)]))} suppressHydrationWarning><body>{children}<GlassCursor/><PwaSetup/></body></html>;}
