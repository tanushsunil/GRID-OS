'use client';
import {useEffect} from 'react';

// Displacement maps for the glass edge: red shifts sideways, green shifts up/down, 50% grey = no shift.
// The centre is left alone; only a band along each edge bends what's behind it, like the rim of real glass.
const X_MAP='data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22100%22%20height%3D%22100%22%20preserveAspectRatio%3D%22none%22%3E%3ClinearGradient%20id%3D%22g%22%20x2%3D%221%22%20y2%3D%220%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22rgb%28255%2C128%2C0%29%22/%3E%3Cstop%20offset%3D%220.13%22%20stop-color%3D%22rgb%28128%2C128%2C0%29%22/%3E%3Cstop%20offset%3D%220.87%22%20stop-color%3D%22rgb%28128%2C128%2C0%29%22/%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22rgb%280%2C128%2C0%29%22/%3E%3C/linearGradient%3E%3Crect%20width%3D%22100%22%20height%3D%22100%22%20fill%3D%22url%28%23g%29%22/%3E%3C/svg%3E';
const Y_MAP='data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22100%22%20height%3D%22100%22%20preserveAspectRatio%3D%22none%22%3E%3ClinearGradient%20id%3D%22g%22%20x2%3D%220%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22rgb%28128%2C255%2C0%29%22/%3E%3Cstop%20offset%3D%220.3%22%20stop-color%3D%22rgb%28128%2C128%2C0%29%22/%3E%3Cstop%20offset%3D%220.7%22%20stop-color%3D%22rgb%28128%2C128%2C0%29%22/%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22rgb%28128%2C0%2C0%29%22/%3E%3C/linearGradient%3E%3Crect%20width%3D%22100%22%20height%3D%22100%22%20fill%3D%22url%28%23g%29%22/%3E%3C/svg%3E';

/** SVG filter that bends the page behind an element's edges (used as `backdrop-filter:url(#grid-refract)`).
 *  Only Chromium browsers support SVG filters in backdrop-filter, so the page is flagged with data-refract
 *  there; Safari and Firefox keep the CSS-only glass (highlights and rim light) instead. */
export default function LiquidRefract(){
 useEffect(()=>{if(/Chrome\/\d/.test(navigator.userAgent))document.documentElement.dataset.refract='on';},[]);
 return <svg width="0" height="0" aria-hidden="true" focusable="false" style={{position:'absolute'}}>
  <filter id="grid-refract" x="0" y="0" width="1" height="1" primitiveUnits="objectBoundingBox" colorInterpolationFilters="sRGB">
   <feImage href={X_MAP} x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="mx"/>
   <feImage href={Y_MAP} x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="my"/>
   <feDisplacementMap in="SourceGraphic" in2="mx" scale="0.09" xChannelSelector="R" yChannelSelector="G" result="bent"/>
   <feDisplacementMap in="bent" in2="my" scale="0.35" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
 </svg>;
}
