'use client';
import {useEffect,useRef,useState} from 'react';

/*
 * Liquid-glass cursor — iPadOS pointer behaviour, reinterpreted as a small volume of liquid glass.
 *
 * Default: a soft circle of viscous liquid: it flows after the pointer and stretches along its path.
 * Magnetic field: within MAGNET px of an interactive element the glass drifts toward it and reaches
 * out like a droplet; over it, the glass merges into the element's shape (rounded rectangle or
 * circle). Leaving, it detaches and draws itself back into a circle, like surface tension pulling a drop round.
 * Moving between neighbouring controls, it flows from one shape into the next instead of resetting.
 * Material: real backdrop refraction where supported — an SVG lens displacement sized to the glass
 * and fixed in pixels, so the bend is the same gentle amount at every size, with slight chromatic
 * dispersion only at the rim and an optically flat centre so labels stay crisp — plus inner
 * highlights, rim reflections and a specular highlight that slides against the motion.
 * Motion is fluid, not springy: every parameter follows a critically damped (viscous) curve that eases out
 * and never overshoots or bounces back, so all state changes flow continuously.
 *
 * Mouse/trackpad only. Off by default: only runs once the cursor toggle is switched on (html[data-cursor=on]), and never on touch screens. With
 * "reduce motion", positions and shapes follow without stretch, overshoot or nudging.
 */
const TARGETS=[
 'a[href]','button:not(:disabled)','select','summary','[role=button]','[role=tab]','[role=option]','[role=menuitem]','[role=switch]',
 'input:not([type=hidden]):not(:disabled)','textarea:not(:disabled)','.hbar.clickable','.kpi','.home-card','.kanban-card','.template-card',
].join(',');
/** Text links inside tables (row titles, project/client names): the cursor stays a droplet over these. */
const PLAIN_TABLE_LINK='td a:not(.button):not(.icon-button),th a:not(.button):not(.icon-button)';
const TEXT_FIELD='input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]),textarea,[contenteditable=true]';
const DOT=20,MAGNET=54,MAX_W=560,MAX_H=280;

type Spring={x:number;v:number;t:number};
const spring=(x=0):Spring=>({x,v:0,t:x});
/** Viscous follow: a critically damped approach to the target (exact, frame-rate independent). It eases out and
 *  carries momentum like a liquid, but can never overshoot, so nothing bounces. tau: response time in seconds. */
const step=(s:Spring,tau:number,dt:number)=>{
 const w=2/tau,x=w*dt,decay=1/(1+x+0.48*x*x+0.235*x*x*x);
 const change=s.x-s.t,temp=(s.v+w*change)*dt;
 s.v=(s.v-w*temp)*decay;let next=s.t+(change+temp)*decay;
 if((change>0)===(next>s.t)||change===0){/* still approaching */}else{next=s.t;s.v=0;} // never pass the target
 s.x=next;return Math.abs(s.t-s.x)>0.005||Math.abs(s.v)>0.005;
};
const smooth=(e0:number,e1:number,x:number)=>{const t=Math.min(1,Math.max(0,(x-e0)/(e1-e0)));return t*t*(3-2*t);};
type Target={el:Element;r:DOMRect;radius:number;circle:boolean;solid:boolean};

/** Lens displacement map: flat centre, increasing bend toward a rounded rim (R = x shift, G = y shift). */
function lensMap(){
 const n=128,c=document.createElement('canvas');c.width=c.height=n;const g=c.getContext('2d')!;const img=g.createImageData(n,n);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const u=(x+0.5)/n*2-1,v=(y+0.5)/n*2-1;const d=Math.pow(Math.pow(Math.abs(u),4)+Math.pow(Math.abs(v),4),0.25);
  const bend=Math.pow(smooth(0.45,1.02,d),1.6);const len=Math.hypot(u,v)||1;
  const i=(y*n+x)*4;img.data[i]=128-(u/len)*bend*127;img.data[i+1]=128-(v/len)*bend*127;img.data[i+2]=128;img.data[i+3]=255;
 }
 g.putImageData(img,0,0);return c.toDataURL();
}

export default function GlassCursor(){
 const root=useRef<HTMLDivElement>(null);const [enabled,setEnabled]=useState(false);const [map,setMap]=useState('');
 useEffect(()=>{
  const fine=window.matchMedia('(hover: hover) and (pointer: fine)');const html=document.documentElement;
  const update=()=>setEnabled(fine.matches&&html.dataset.cursor==='on');
  update();fine.addEventListener('change',update);
  const watch=new MutationObserver(update);watch.observe(html,{attributes:true,attributeFilter:['data-cursor']});
  return()=>{fine.removeEventListener('change',update);watch.disconnect();};
 },[]);
 useEffect(()=>{if(enabled&&!map)setMap(lensMap());},[enabled,map]);

 useEffect(()=>{
  const el=root.current;if(!enabled||!el||!map)return;
  const body=el.querySelector<HTMLElement>('.lg-body')!;const spec=el.querySelector<HTMLElement>('.lg-spec')!;
  const lensImg=document.querySelector<SVGFEImageElement>('#lg-refract feImage');
  const maps=[...document.querySelectorAll<SVGFEDisplacementMapElement>('#lg-refract feDisplacementMap')];
  const html=document.documentElement;const calm=window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // pointer, geometry and material springs
  const cx=spring(-200),cy=spring(-200),w=spring(DOT),h=spring(DOT),rad=spring(DOT/2);
  const sx=spring(),sy=spring(),press=spring(1),refr=spring(0),merge=spring(0),offX=spring(),offY=spring();
  let mx=-200,my=-200,shown=false,frame=0,last=0,downAt=0;
  let targets:Target[]=[];let dirty=true;let active:Target|null=null;let merged=false;let mergedAt=0;
  let nudged:{el:HTMLElement;x:number;y:number}|null=null;

  const collect=()=>{
   dirty=false;const vw=innerWidth,vh=innerHeight;const out:Target[]=[];
   for(const t of document.querySelectorAll(TARGETS)){
    if(el.contains(t))continue;
    if(t.matches(PLAIN_TABLE_LINK))continue;           // text links inside tables keep the plain droplet
    const r=t.getBoundingClientRect();
    if(r.width<4||r.height<4||r.right<-MAGNET||r.bottom<-MAGNET||r.left>vw+MAGNET||r.top>vh+MAGNET||r.width>MAX_W||r.height>MAX_H)continue;
    const cs=getComputedStyle(t);if(cs.visibility==='hidden'||cs.pointerEvents==='none')continue;
    const br=cs.borderTopLeftRadius;const circle=br.endsWith('%')?parseFloat(br)>=50:parseFloat(br)>=Math.min(r.width,r.height)/2-1;
    // "solid" controls have their own surface and may lean toward the cursor; plain text links never move
    const solid=cs.backgroundColor!=='rgba(0, 0, 0, 0)'||parseFloat(cs.borderTopWidth)>0||t.matches('button,[role=button],[role=tab],[role=switch],select,input,textarea');
    out.push({el:t,r,radius:circle?Math.min(r.width,r.height)/2:(parseFloat(br)||8),circle,solid});
   }
   targets=out;
  };
  const distTo=(r:DOMRect,x:number,y:number)=>Math.hypot(Math.max(r.left-x,0,x-r.right),Math.max(r.top-y,0,y-r.bottom));
  const pick=()=>{
   if(dirty)collect();let best:Target|null=null,bestD=Infinity,bestA=Infinity;
   for(const t of targets){const d=distTo(t.r,mx,my);if(d>MAGNET)continue;const a=t.r.width*t.r.height;
    // closest wins; when inside several (a button inside a card) the smallest wins
    if(d<bestD-0.5||(Math.abs(d-bestD)<=0.5&&a<bestA)){best=t;bestD=d;bestA=a;}}
   return {t:best,d:bestD};
  };
  const setNudge=(t:Target|null,x:number,y:number)=>{
   const target=t&&t.solid?t.el as HTMLElement:undefined;
   if(nudged&&nudged.el!==target){const n=nudged;n.el.animate([{translate:`${n.x}px ${n.y}px`},{translate:'0px 0px'}],{duration:300,easing:'cubic-bezier(.22,1,.36,1)'});n.el.style.removeProperty('translate');nudged=null;}
   if(!target||calm)return;nudged={el:target,x,y};target.style.translate=`${x.toFixed(2)}px ${y.toFixed(2)}px`;
  };

  const tick=(now:number)=>{
   const dt=Math.min(0.032,(now-(last||now))/1000)||1/60;last=now;
   const {t,d}=pick();
   // hysteresis: stay merged while within 4px; flow straight into a neighbour right after leaving one
   const inside=!!t&&(d<=0||(t===active&&merged&&d<=4)||(!merged&&now-mergedAt<170&&d<MAGNET*0.55));
   if(inside){if(!merged||t!==active)mergedAt=now;merged=true;active=t;}else{if(merged)mergedAt=now;merged=false;active=t;}
   const f=t&&!inside?smooth(0,1,1-d/MAGNET):0;     // magnetic influence while approaching
   merge.t=inside?1:0;

   let tx=mx,ty=my,tw=DOT,th=DOT,tr=DOT/2,reachX=0,reachY=0;
   if(inside&&t){
    const r=t.r,ccx=r.left+r.width/2,ccy=r.top+r.height/2,small=Math.min(r.width,r.height)<48;
    const pad=t.circle?6:small?8:6;tw=r.width+pad;th=r.height+pad;tr=t.circle?Math.min(tw,th)/2:Math.min(t.radius+pad/2,th/2);
    tx=ccx+(mx-ccx)*0.07;ty=ccy+(my-ccy)*0.07;     // tiny parallax toward the pointer
    setNudge(t,Math.max(-2,Math.min(2,(mx-ccx)*0.03)),Math.max(-2,Math.min(2,(my-ccy)*0.03))-1);
   }else{
    setNudge(null,0,0);
    if(t&&f>0){const qx=Math.max(t.r.left,Math.min(mx,t.r.right)),qy=Math.max(t.r.top,Math.min(my,t.r.bottom));const vx=qx-mx,vy=qy-my,len=Math.hypot(vx,vy)||1;
     tx=mx+vx*0.24*f;ty=my+vy*0.24*f;                // drift toward the field
     reachX=vx/len*0.3*f*f;reachY=vy/len*0.3*f*f;    // droplet reaching toward the target
     tw=th=DOT*(1+0.1*f);tr=tw/2;}
   }
   cx.t=tx;cy.t=ty;w.t=tw;h.t=th;rad.t=tr;

   let moving=false;
   if(calm){cx.x=tx;cy.x=ty;w.x=tw;h.x=th;rad.x=tr;cx.v=cy.v=0;sx.x=sy.x=0;merge.x=merge.t;}
   else{
    // position flows after the pointer; once merged it glides more slowly, like liquid settling into a mould
    moving=step(cx,inside?0.09:0.045,dt)||moving;moving=step(cy,inside?0.09:0.045,dt)||moving;
    // the shape morphs a beat behind the position, so the glass visibly flows into (and out of) each control
    moving=step(w,0.13,dt)||moving;moving=step(h,0.13,dt)||moving;moving=step(rad,0.14,dt)||moving;
    moving=step(merge,0.16,dt)||moving;
    // stretch: elongates along the direction of travel plus the droplet's reach, then relaxes back with
    // viscous drag (no compress-and-rebound)
    const vmax=inside?0.035:0.13,vs=Math.min(Math.hypot(cx.v,cy.v)/2800,vmax),vang=Math.atan2(cy.v,cx.v);
    sx.t=Math.cos(vang)*vs+reachX;sy.t=Math.sin(vang)*vs+reachY;
    moving=step(sx,0.12,dt)||moving;moving=step(sy,0.12,dt)||moving;
    moving=step(offX,0.1,dt)||moving;moving=step(offY,0.1,dt)||moving;
   }
   moving=step(press,0.07,dt)||moving;moving=step(refr,0.18,dt)||moving;
   if(now-downAt>140){refr.t=0;offX.t=0;offY.t=0;}

   // write
   const W=Math.max(2,w.x),H=Math.max(2,h.x),m=Math.min(1,Math.max(0,merge.x));
   el.style.transform=`translate3d(${(cx.x+offX.x-W/2).toFixed(2)}px,${(cy.x+offY.x-H/2).toFixed(2)}px,0)`;
   el.style.width=W.toFixed(2)+'px';el.style.height=H.toFixed(2)+'px';el.style.borderRadius=Math.max(0,Math.min(rad.x,Math.min(W,H)/2)).toFixed(2)+'px';
   const s=Math.hypot(sx.x,sy.x),ang=Math.atan2(sy.x,sx.x)*180/Math.PI,along=1+s,across=1/Math.sqrt(1+s*1.6); // volume-preserving
   body.style.transform=`rotate(${ang.toFixed(1)}deg) scale(${(along*press.x).toFixed(4)},${(across*press.x).toFixed(4)}) rotate(${(-ang).toFixed(1)}deg)`;
   spec.style.transform=`translate(${(-cx.v*0.0025).toFixed(2)}px,${(-cy.v*0.0025).toFixed(2)}px)`;
   el.dataset.merged=m>0.5?'true':'false';
   el.dataset.thin=m>0.5&&(Math.min(W,H)<40||Math.max(W,H)>56)?'true':'false';
   // refraction in pixels, lens sized to the glass: ~4.5px bend on the free droplet, up to ~2.2px rim-only when merged
   lensImg?.setAttribute('width',W.toFixed(1));lensImg?.setAttribute('height',H.toFixed(1));
   // merged glass only bends the background on small icon-sized controls; on buttons, links and cards with text
   // the glass keeps its rim, highlight and depth but no distortion, so typography stays crisp
   const iconSized=Math.max(W,H)<=56;
   const strength=(4.5*(1-m)+(iconSized?2.2:0)*m)*(1+refr.x*0.8);
   maps.forEach((mp,i)=>mp.setAttribute('scale',(strength*[1.04,1,0.96][i]).toFixed(3)));
   frame=moving||Math.abs(cx.t-cx.x)>0.05||Math.abs(cy.t-cy.x)>0.05?requestAnimationFrame(tick):0;if(!frame)last=0;
  };
  const kick=()=>{if(!frame)frame=requestAnimationFrame(tick);};

  const move=(e:PointerEvent)=>{
   if(e.pointerType!=='mouse')return;mx=e.clientX;my=e.clientY;
   const over=e.target instanceof Element?e.target:null;const field=over?.closest(TEXT_FIELD);
   // inside a large text area the native caret takes over
   el.dataset.visible=field&&!(active&&merged&&active.el===field)&&(field.getBoundingClientRect().height>60)?'false':'true';
   if(!shown){shown=true;cx.x=cx.t=mx;cy.x=cy.t=my;cx.v=cy.v=0;html.classList.add('lg-cursor-on');}
   kick();
  };
  const down=(e:PointerEvent)=>{if(e.pointerType!=='mouse')return;downAt=performance.now();press.t=merged?0.965:0.86;refr.t=1;
   // tiny fluid displacement toward the click point
   offX.t=(e.clientX-cx.x)*(merged?0.06:0.12);offY.t=(e.clientY-cy.x)*(merged?0.06:0.12);kick();};
  const up=()=>{press.t=1;kick();};
  const invalidate=()=>{dirty=true;kick();};
  const leave=()=>{el.dataset.visible='false';shown=false;setNudge(null,0,0);};
  const dragStart=()=>{el.dataset.visible='false';setNudge(null,0,0);};const dragEnd=()=>{if(shown)el.dataset.visible='true';invalidate();};
  // Modal <dialog>s render in the browser's top layer, above any z-index. The cursor joins the top
  // layer as a manual popover and is re-raised whenever a dialog opens, so it stays above them.
  const raise=()=>{try{if(el.matches(':popover-open'))el.hidePopover();el.showPopover();}catch{}};
  if('showPopover' in el)raise();
  const mo=new MutationObserver(list=>{
   if(list.some(m=>m.attributeName==='open'&&m.target instanceof HTMLDialogElement&&m.target.open))raise();
   if(list.some(m=>!el.contains(m.target)))invalidate();
  });
  mo.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden','open','disabled','aria-expanded']});
  const timer=setInterval(()=>{if(shown)dirty=true;},600);  // catch layout shifts the observer can't see

  window.addEventListener('pointermove',move,{passive:true});window.addEventListener('pointerdown',down);window.addEventListener('pointerup',up);
  window.addEventListener('scroll',invalidate,{passive:true,capture:true});window.addEventListener('resize',invalidate);
  html.addEventListener('mouseleave',leave);window.addEventListener('blur',leave);
  window.addEventListener('dragstart',dragStart);window.addEventListener('dragend',dragEnd);
  return()=>{cancelAnimationFrame(frame);clearInterval(timer);mo.disconnect();try{el.hidePopover();}catch{}setNudge(null,0,0);html.classList.remove('lg-cursor-on');
   window.removeEventListener('pointermove',move);window.removeEventListener('pointerdown',down);window.removeEventListener('pointerup',up);
   window.removeEventListener('scroll',invalidate,{capture:true});window.removeEventListener('resize',invalidate);
   html.removeEventListener('mouseleave',leave);window.removeEventListener('blur',leave);
   window.removeEventListener('dragstart',dragStart);window.removeEventListener('dragend',dragEnd);};
 },[enabled,map]);

 if(!enabled)return null;
 return <>
  <svg className="lg-defs" aria-hidden="true" width="0" height="0">
   <filter id="lg-refract" x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
    {map&&<feImage href={map} x="0" y="0" width={DOT} height={DOT} preserveAspectRatio="none" result="lens"/>}
    <feDisplacementMap in="SourceGraphic" in2="lens" scale="4.7" xChannelSelector="R" yChannelSelector="G" result="dR"/>
    <feDisplacementMap in="SourceGraphic" in2="lens" scale="4.5" xChannelSelector="R" yChannelSelector="G" result="dG"/>
    <feDisplacementMap in="SourceGraphic" in2="lens" scale="4.3" xChannelSelector="R" yChannelSelector="G" result="dB"/>
    {/* slight chromatic dispersion: each colour channel bends a little differently, only visible at the rim */}
    <feColorMatrix in="dR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r"/>
    <feColorMatrix in="dG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g"/>
    <feColorMatrix in="dB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b"/>
    <feComposite in="r" in2="g" operator="arithmetic" k2="1" k3="1" result="rg"/>
    <feComposite in="rg" in2="b" operator="arithmetic" k2="1" k3="1"/>
   </filter>
  </svg>
  <div ref={root} className="lg-cursor" aria-hidden="true" data-visible="false" popover="manual">
   <span className="lg-body"><span className="lg-refract"/><span className="lg-tint"/><span className="lg-spec"/><span className="lg-rim"/></span>
  </div>
 </>;
}
