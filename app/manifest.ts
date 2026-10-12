import type {MetadataRoute} from 'next';

/** Lets GRID OS be installed as an app (Chrome/Edge: install icon in the address bar; Safari: Add to Dock / Home Screen). */
export default function manifest():MetadataRoute.Manifest{
 return {
  id:'/',name:'GRID OS',short_name:'GRID OS',description:'Projects, production and delivery. One connected agency workspace.',
  start_url:'/',scope:'/',display:'standalone',
  background_color:'#000000',theme_color:'#000000',categories:['business','productivity'],
  icons:[
   {src:'/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},
   {src:'/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},
   {src:'/icon-maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'},
  ],
  shortcuts:[
   {name:'Projects',url:'/projects',icons:[{src:'/icon-192.png',sizes:'192x192'}]},
   {name:'Invoices',url:'/invoices',icons:[{src:'/icon-192.png',sizes:'192x192'}]},
   {name:'Tasks',url:'/tasks',icons:[{src:'/icon-192.png',sizes:'192x192'}]},
  ],
 };
}
