export interface MenuItem { action: string; label: string; icon: string; shortcut?: string; danger?: boolean; disabled?: boolean }
export function createContextMenu(icon: (name:string)=>string, perform:(action:string)=>void) {
  const menu=document.createElement("div");
  menu.className="studio-context-menu";
  menu.setAttribute("role","menu");
  menu.setAttribute("aria-label","Действия с объектами");
  menu.hidden=true;
  document.body.append(menu);
  let previous:HTMLElement|null=null;
  const buttons=()=>Array.from(menu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
  function close(restore=false) {
    if(menu.hidden)return;
    menu.hidden=true;
    if(restore && previous?.isConnected)previous.focus({preventScroll:true});
    previous=null;
  }
  function open(x:number,y:number,groups:MenuItem[][]) {
    previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    menu.replaceChildren();
    groups.filter(group=>group.length).forEach((group,index)=>{
      if(index){const line=document.createElement("div");line.setAttribute("role","separator");menu.append(line);}
      for(const item of group){
        const b=document.createElement("button");b.type="button";b.setAttribute("role","menuitem");
        b.dataset.menuAction=item.action;b.disabled=Boolean(item.disabled);b.classList.toggle("danger",Boolean(item.danger));
        const label=document.createElement("span");label.textContent=item.label;
        const shortcut=document.createElement("kbd");shortcut.textContent=item.shortcut??"";
        b.innerHTML=icon(item.icon);b.append(label,shortcut);
        b.addEventListener("click",()=>{close();perform(item.action);});
        menu.append(b);
      }
    });
    menu.hidden=false;
    menu.style.left="0px";menu.style.top="0px";
    const box=menu.getBoundingClientRect();
    menu.style.left=Math.max(8,Math.min(x,innerWidth-box.width-8))+"px";
    menu.style.top=Math.max(8,Math.min(y,innerHeight-box.height-8))+"px";
    buttons()[0]?.focus({preventScroll:true});
  }
  menu.addEventListener("keydown",e=>{
    const list=buttons(), index=list.indexOf(document.activeElement as HTMLButtonElement);
    if(e.key==="Escape"){e.preventDefault();e.stopPropagation();close(true);}
    else if(["ArrowDown","ArrowUp","Home","End"].includes(e.key)){
      e.preventDefault();e.stopPropagation();
      const next=e.key==="Home"?0:e.key==="End"?list.length-1:(index+(e.key==="ArrowDown"?1:-1)+list.length)%list.length;
      list[next]?.focus();
    }else if(e.key==="Tab"){close();}
    else e.stopPropagation();
  });
  document.addEventListener("pointerdown",e=>{if(!menu.contains(e.target as Node))close();},true);
  window.addEventListener("resize",()=>close());
  window.addEventListener("blur",()=>close());
  return {open,close};
}
