/* Standalone storage layer for GitHub Pages.
   Provides the same small API the app uses (db, assets, downloads, user),
   backed by IndexedDB in this browser, with localStorage / memory as fallbacks. */
(function(){
  const DB_NAME="fichas-tecnicas", STORE="sheets";
  const listeners=new Map(); /* collection -> Set of callbacks */ let cache=new Map(); let backend="memory";
  const bc=("BroadcastChannel" in window)?new BroadcastChannel("fichas-tecnicas"):null;

  function openIdb(){return new Promise((res,rej)=>{
    if(!("indexedDB" in window))return rej(new Error("no idb"));
    const r=indexedDB.open(DB_NAME,1);
    r.onupgradeneeded=()=>r.result.createObjectStore(STORE);
    r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);
  })}
  let idb=null;
  const tx=(mode,fn)=>new Promise((res,rej)=>{const t=idb.transaction(STORE,mode);const st=t.objectStore(STORE);const out=fn(st);t.oncomplete=()=>res(out&&out.result);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error)});

  async function loadAll(){
    try{
      idb=await openIdb();backend="idb";
      const m=new Map();
      await new Promise((res,rej)=>{const t=idb.transaction(STORE,"readonly");const c=t.objectStore(STORE).openCursor();
        c.onsuccess=()=>{const cur=c.result;if(cur){m.set(cur.key,cur.value);cur.continue()}else res()};c.onerror=()=>rej(c.error)});
      for(const [k,v] of [...m]){if(!k.includes("/")){m.delete(k);m.set("sheets/"+k,v);await tx("readwrite",st=>{st.delete(k);return st.put(v,"sheets/"+k)})}}
      cache=m;return;
    }catch(e){idb=null}
    try{const raw=localStorage.getItem(DB_NAME);cache=new Map(Object.entries(raw?JSON.parse(raw):{}).map(([k,v])=>[k.includes("/")?k:"sheets/"+k,v]));backend="local";}
    catch(e){cache=new Map();backend="memory"}
  }
  async function persist(id,val){
    if(backend==="idb"){await tx("readwrite",st=>val===undefined?st.delete(id):st.put(val,id));return}
    if(backend==="local"){
      try{localStorage.setItem(DB_NAME,JSON.stringify(Object.fromEntries(cache)))}
      catch(e){const err=new Error("quota");err.code="quota_exceeded";throw err}
    }
  }
  function snapshot(coll){
    const pre=coll+"/";
    const docs=[...cache.entries()].filter(([k])=>k.startsWith(pre)).sort((a,b)=>a[0]<b[0]?-1:1).map(([k,v])=>({id:k.slice(pre.length),exists:true,data:()=>v}));
    return {docs,size:docs.length,empty:!docs.length};
  }
  function emit(coll){const colls=coll?[coll]:[...listeners.keys()];colls.forEach(c=>{const s=snapshot(c);(listeners.get(c)||[]).forEach(fn=>{try{fn(s)}catch(e){console.error(e)}})})}
  const newId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,10);
  const clone=o=>JSON.parse(JSON.stringify(o));

  const ready=loadAll().then(async()=>{
    // First visit: add one clearly marked example sheet.
    let seeded=false;try{seeded=localStorage.getItem(DB_NAME+"-seeded")==="1"}catch(e){}
    if(!seeded&&!cache.size&&window.FT_EXAMPLE){cache.set("sheets/exemplo-creme-abobora",clone(window.FT_EXAMPLE));await persist("sheets/exemplo-creme-abobora",clone(window.FT_EXAMPLE)).catch(()=>{})}
    // Default library details, only when none have been saved on this device yet.
    if(window.FT_LIBRARY&&!cache.has("settings/library")){const v=clone(window.FT_LIBRARY);cache.set("settings/library",v);await persist("settings/library",v).catch(()=>{})}
    try{localStorage.setItem(DB_NAME+"-seeded","1")}catch(e){}
  });

  if(bc)bc.onmessage=async()=>{await loadAll();emit()};

  function docRef(coll,id){const key=coll+"/"+id;return {
    id,
    async set(data){await ready;const v=clone(data);cache.set(key,v);await persist(key,v);emit(coll);bc&&bc.postMessage("changed")},
    async delete(){await ready;cache.delete(key);await persist(key,undefined);emit(coll);bc&&bc.postMessage("changed")},
    async get(){await ready;const v=cache.get(key);return {id,exists:!!v,data:()=>v}}
  }}
  const db={collection(name){return {
    doc:(id)=>docRef(name,id||newId()),
    onSnapshot(next){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(next);ready.then(()=>next(snapshot(name)));return ()=>listeners.get(name).delete(next)}
  }}};

  function resizeToDataUrl(file){return new Promise((res,rej)=>{
    const url=URL.createObjectURL(file);const im=new Image();
    im.onload=()=>{try{const sc=Math.min(1,1400/Math.max(im.naturalWidth,im.naturalHeight));const cv=document.createElement("canvas");
      cv.width=Math.round(im.naturalWidth*sc);cv.height=Math.round(im.naturalHeight*sc);const cx=cv.getContext("2d");
      cx.fillStyle="#fff";cx.fillRect(0,0,cv.width,cv.height);cx.drawImage(im,0,0,cv.width,cv.height);URL.revokeObjectURL(url);
      res(cv.toDataURL("image/jpeg",.82))}catch(e){rej(e)}};
    im.onerror=()=>{URL.revokeObjectURL(url);rej(new Error("image"))};im.src=url;
  })}
  const assets={
    async upload(file){const data=await resizeToDataUrl(file);return {id:null,url:data,sizeBytes:data.length,contentType:"image/jpeg"}},
    async delete(){},
    async list(){return {assets:[],usage:{}}}
  };
  const downloads={async save({filename,data}){
    const blob=data instanceof Blob?data:new Blob([data]);const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),4000);return {status:"saved"};
  }};
  const user={async can(){return true},isOwner:()=>true,canEdit:()=>true,async id(){return "local"}};

  const caps={db,assets,downloads,user};
  window.FT_STANDALONE=true;
  window.FT_BACKEND=()=>backend;
  window.claude={use:async name=>{await ready;return caps[name]||null}};
})();
