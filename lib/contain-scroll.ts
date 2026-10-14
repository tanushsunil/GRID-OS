/** Keep scrolling inside a panel (sidebar, notifications, menus) from moving the page underneath.
 *  Lists inside the panel still scroll; once they reach their end, or where nothing can scroll, the
 *  wheel or swipe simply stops instead of being passed on to the page. Returns a cleanup function. */
export function containScroll(panel:HTMLElement):()=>void{
 // can `el` (or a scrollable box between the target and the panel) still scroll by `dy`?
 const canScroll=(target:EventTarget|null,dy:number)=>{
  for(let el=target instanceof Element?target:null;el&&panel.contains(el);el=el.parentElement){
   const s=getComputedStyle(el);if(!/(auto|scroll)/.test(s.overflowY)||el.scrollHeight<=el.clientHeight+1)continue;
   if(dy<0?el.scrollTop>0:el.scrollTop+el.clientHeight<el.scrollHeight-1)return true;
   if(el===panel)break;
  }
  return false;
 };
 const wheel=(e:WheelEvent)=>{if(!e.ctrlKey&&!canScroll(e.target,e.deltaY))e.preventDefault();};
 let lastY=0;
 const start=(e:TouchEvent)=>{lastY=e.touches[0]?.clientY??0;};
 const move=(e:TouchEvent)=>{const y=e.touches[0]?.clientY??lastY;const dy=lastY-y;lastY=y;if(e.cancelable&&!canScroll(e.target,dy))e.preventDefault();};
 panel.addEventListener('wheel',wheel,{passive:false});
 panel.addEventListener('touchstart',start,{passive:true});
 panel.addEventListener('touchmove',move,{passive:false});
 return ()=>{panel.removeEventListener('wheel',wheel);panel.removeEventListener('touchstart',start);panel.removeEventListener('touchmove',move);};
}
