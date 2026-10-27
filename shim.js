/* Storage layer for the GitHub Pages site.
   Gives the app the small API it expects (db, assets, downloads, user).
   - Local cache in this browser (IndexedDB, falling back to localStorage / memory) for speed and offline use.
   - Shared copy in the repository: data/biblioteca.json (all records) and data/fotos/ (photos),
     read and written through the GitHub API. Reading needs nothing; writing needs a GitHub token
     saved on the device. Changes are merged per record: the most recently changed version wins. */
(function(){
  const R=window.FT_REMOTE||null;
  const DB_NAME="fichas-tecnicas", STORE="sheets", TOKEN_KEY="ft-gh-token", DEL_KEY="ft-deleted", DIRTY_KEY="ft-dirty";
  const listeners=new Map(); /* collection -> Set of callbacks */ let cache=new Map(); let backend="memory";
  const bc=("BroadcastChannel" in window)?new BroadcastChannel("fichas-tecnicas"):null;
  const ls={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}},del(k){try{localStorage.removeItem(k)}catch(e){}}};

  /* ---------- local cache ---------- */
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
      for(const [k,v] of [...m]){if(!String(k).includes("/")){m.delete(k);m.set("sheets/"+k,v);await tx("readwrite",st=>{st.delete(k);return st.put(v,"sheets/"+k)})}}
      cache=m;return;
    }catch(e){idb=null}
    try{const raw=ls.get(DB_NAME);cache=new Map(Object.entries(raw?JSON.parse(raw):{}).map(([k,v])=>[k.includes("/")?k:"sheets/"+k,v]));backend=raw===null&&!("localStorage" in window)?"memory":"local";}
    catch(e){cache=new Map();backend="memory"}
  }
  async function persist(key,val){
    if(backend==="idb"){await tx("readwrite",st=>val===undefined?st.delete(key):st.put(val,key));return}
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
  const stamp=v=>v&&typeof v.updatedAt==="number"?v.updatedAt:0;

  /* ---------- shared copy in the repository ---------- */
  let token=ls.get(TOKEN_KEY)||null;
  let deleted=new Map();try{deleted=new Map(Object.entries(JSON.parse(ls.get(DEL_KEY)||"{}")))}catch(e){}
  const saveDeleted=()=>ls.set(DEL_KEY,JSON.stringify(Object.fromEntries(deleted)));
  let dirty=ls.get(DIRTY_KEY)==="1";
  const setDirty=v=>{dirty=v;v?ls.set(DIRTY_KEY,"1"):ls.del(DIRTY_KEY)};
  let state={status:R?(token?"busy":"ro"):"local",lastSync:null,error:null};
  const stateFns=new Set();
  function setState(p){state={...state,...p};stateFns.forEach(fn=>{try{fn(state)}catch(e){}})}
  const API=R?`https://api.github.com/repos/${R.owner}/${R.repo}/contents/`:"";
  const hdr=(extra)=>({Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28",...(token?{Authorization:"Bearer "+token}:{}),...(extra||{})});
  const b64enc=str=>{const b=new TextEncoder().encode(str);let s="";for(let i=0;i<b.length;i+=0x8000)s+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000));return btoa(s)};
  const b64dec=b64=>{const bin=atob(String(b64).replace(/\s/g,""));const b=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)b[i]=bin.charCodeAt(i);return new TextDecoder().decode(b)};
  function httpError(r){const e=new Error("HTTP "+r.status);e.status=r.status;return e}
  async function fetchRemote(){
    const url=API+R.path+"?ref="+encodeURIComponent(R.branch)+"&_="+Date.now();
    const r=await fetch(url,{headers:hdr(),cache:"no-store"});
    if(r.status===404)return {sha:null,data:null};
    if(!r.ok)throw httpError(r);
    const j=await r.json();let text;
    if(j.content&&j.encoding==="base64")text=b64dec(j.content);
    else{const r2=await fetch(url,{headers:hdr({Accept:"application/vnd.github.raw"}),cache:"no-store"});if(!r2.ok)throw httpError(r2);text=await r2.text()}
    return {sha:j.sha,data:text.trim()?JSON.parse(text):null};
  }
  /* Bring remote records into the local cache; the newer version of each record wins. */
  async function mergeRemote(data){
    const colls=new Set(),docs=(data&&data.docs)||{},del=(data&&data.deleted)||{};
    for(const [k,dt] of Object.entries(del)){if((deleted.get(k)||0)<dt)deleted.set(k,dt)}
    for(const [k,v] of Object.entries(docs)){
      if((deleted.get(k)||0)>=stamp(v))continue;
      const cur=cache.get(k);
      if(!cur||stamp(v)>stamp(cur)){cache.set(k,v);await persist(k,v).catch(()=>{});colls.add(k.split("/")[0])}
    }
    for(const [k,dt] of deleted){const cur=cache.get(k);if(cur&&stamp(cur)<=dt){cache.delete(k);await persist(k,undefined).catch(()=>{});colls.add(k.split("/")[0])}}
    saveDeleted();
    /* anything here that the shared copy lacks or holds an older version of still has to be sent */
    for(const [k,v] of cache){const rv=docs[k];if(!rv||stamp(v)>stamp(rv)){setDirty(true);break}}
    for(const [k,dt] of deleted){if((del[k]||0)<dt&&docs[k]){setDirty(true);break}}
    colls.forEach(c=>emit(c));
  }
  const fileBody=()=>JSON.stringify({format:"fichas-tecnicas-store",version:1,updatedAt:Date.now(),
    docs:Object.fromEntries([...cache.entries()].sort((a,b)=>a[0]<b[0]?-1:1)),
    deleted:Object.fromEntries([...deleted.entries()].sort((a,b)=>a[0]<b[0]?-1:1))},null,1);
  let pulling=null;
  function pull(){
    if(!R)return Promise.resolve();
    if(pulling)return pulling;
    if(!dirty)setState({status:"busy"});
    pulling=(async()=>{
      try{
        const {data}=await fetchRemote();await mergeRemote(data);
        if(dirty&&token){schedulePush(300)}else setState({status:token?(dirty?"pending":"ok"):"ro",lastSync:Date.now(),error:null});
      }catch(e){setState({status:navigator.onLine===false?"offline":"error",error:e.status===401||e.status===403?"auth":(e.message||"error")})}
    })().finally(()=>{pulling=null});
    return pulling;
  }
  let pushing=null,pushTimer=null,again=false;
  function schedulePush(ms){setDirty(true);if(!R)return;if(!token){setState({status:"ro"});return}setState({status:"pending"});clearTimeout(pushTimer);pushTimer=setTimeout(push,ms==null?2500:ms)}
  function push(){
    if(!R||!token)return Promise.resolve();
    if(pushing){again=true;return pushing}
    pushing=(async()=>{
      setState({status:"busy"});
      for(let attempt=0;attempt<4;attempt++){
        const {sha,data}=await fetchRemote();await mergeRemote(data);
        const res=await fetch(API+R.path,{method:"PUT",headers:hdr({"Content-Type":"application/json"}),
          body:JSON.stringify({message:"Fichas técnicas: atualização da biblioteca",content:b64enc(fileBody()),branch:R.branch,...(sha?{sha}:{})})});
        if(res.ok){setDirty(false);setState({status:"ok",lastSync:Date.now(),error:null});bc&&bc.postMessage("changed");return}
        if(res.status===409||res.status===422)continue;
        if(res.status===401||res.status===403||res.status===404){setState({status:"error",error:"auth"});return}
        throw httpError(res);
      }
      setState({status:"error",error:"conflict"});
    })().catch(e=>setState({status:navigator.onLine===false?"offline":"error",error:e.message||"error"}))
      .finally(()=>{pushing=null;if(again){again=false;if(dirty)schedulePush(500)}});
    return pushing;
  }

  /* ---------- start-up ---------- */
  const withTimeout=(p,ms)=>Promise.race([p,new Promise(r=>setTimeout(r,ms))]);
  const ready=loadAll().then(async()=>{
    if(R){await withTimeout(pull(),8000);return}
    // Local-only mode: first visit gets one marked example sheet and the default library details.
    let seeded=ls.get(DB_NAME+"-seeded")==="1";
    if(!seeded&&!cache.size&&window.FT_EXAMPLE){cache.set("sheets/exemplo-creme-abobora",clone(window.FT_EXAMPLE));await persist("sheets/exemplo-creme-abobora",clone(window.FT_EXAMPLE)).catch(()=>{})}
    if(window.FT_LIBRARY&&!cache.has("settings/library")){const v=clone(window.FT_LIBRARY);cache.set("settings/library",v);await persist("settings/library",v).catch(()=>{})}
    ls.set(DB_NAME+"-seeded","1");
  });
  if(bc)bc.onmessage=async()=>{await loadAll();emit()};
  if(R){
    setInterval(()=>{if(!document.hidden&&!dirty)pull()},token?45000:180000);
    document.addEventListener("visibilitychange",()=>{if(document.hidden){if(dirty&&token)push()}else pull()});
    window.addEventListener("online",()=>{dirty&&token?push():pull()});
  }

  /* ---------- API used by the app ---------- */
  function docRef(coll,id){const key=coll+"/"+id;return {
    id,
    async set(data){await ready;const v=clone(data);if(typeof v.updatedAt!=="number")v.updatedAt=Date.now();
      cache.set(key,v);if(deleted.has(key)){deleted.delete(key);saveDeleted()}await persist(key,v);emit(coll);bc&&bc.postMessage("changed");schedulePush()},
    async delete(){await ready;cache.delete(key);deleted.set(key,Date.now());saveDeleted();await persist(key,undefined);emit(coll);bc&&bc.postMessage("changed");schedulePush()},
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
    async upload(file){
      const data=await resizeToDataUrl(file);
      if(R&&token){
        const name="data/fotos/"+newId()+".jpg";
        const res=await fetch(API+name,{method:"PUT",headers:hdr({"Content-Type":"application/json"}),body:JSON.stringify({message:"Fichas técnicas: nova fotografia",content:data.split(",")[1],branch:R.branch})});
        if(!res.ok)throw httpError(res);
        return {id:name,url:`https://raw.githubusercontent.com/${R.owner}/${R.repo}/${R.branch}/${name}`,sizeBytes:data.length,contentType:"image/jpeg"};
      }
      return {id:null,url:data,sizeBytes:data.length,contentType:"image/jpeg"};
    },
    async delete(){}, /* photo files stay in the repository; they may still be used by a copied sheet */
    async list(){return {assets:[],usage:{}}}
  };
  const downloads={async save({filename,data}){
    const blob=data instanceof Blob?data:new Blob([data]);const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),4000);return {status:"saved"};
  }};
  const user={async can(){return R?!!token:true},isOwner:()=>true,canEdit:()=>R?!!token:true,async id(){return "local"}};

  window.FT_SYNC=R?{
    configured:true,repo:`${R.owner}/${R.repo}`,path:R.path,
    state:()=>state,
    on(fn){stateFns.add(fn);return ()=>stateFns.delete(fn)},
    hasToken:()=>!!token,
    async testToken(tk){
      const r=await fetch(`https://api.github.com/repos/${R.owner}/${R.repo}`,{headers:{Accept:"application/vnd.github+json",Authorization:"Bearer "+tk}});
      if(!r.ok)return {ok:false,status:r.status};
      const j=await r.json();return {ok:!!(j.permissions&&j.permissions.push),status:r.status};
    },
    setToken(tk){ls.set(TOKEN_KEY,tk.trim());location.reload()},
    clearToken(){ls.del(TOKEN_KEY);location.reload()},
    syncNow(){return token&&dirty?push():pull()}
  }:null;

  const caps={db,assets,downloads,user};
  window.FT_STANDALONE=true;
  window.FT_BACKEND=()=>backend;
  window.claude={use:async name=>{await ready;return caps[name]||null}};
})();
