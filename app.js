(function(){
  const $ = (s)=>document.querySelector(s);
  const A4 = {w:210,h:297};
  const PT = 0.3528; // mm por punto
  const STORAGE_KEY = 'hojas-wireframe:state';
  const PNG_DPI = 200;
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const mmToPx = (mm)=>Math.round(mm * PNG_DPI / 25.4);
  const slugify = (s)=>(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

  const palettes = {
    gray: {frame:'#454b4f', soft:'#6b7378', grid:'#9aa1a6', text:'#454b4f', fill:'#454b4f'},
    blue: {frame:'#5c9fd6', soft:'#8dbde4', grid:'#bcd8ef', text:'#5c9fd6', fill:'#5c9fd6'}
  };
  const LW = 1.5; // multiplicador de grosor de línea, para sobrevivir a impresoras en modo borrador

  // Ajustes por tipo de hoja + comunes
  const state = {
    sheet:'mobile',
    mobile:{count:6, orient:'auto', bg:'dots', chrome:true},
    desktop:{count:4, orient:'auto', bg:'cols', chrome:true},
    custom:{count:4, orient:'auto', bg:'dots', chrome:false, name:'', widthMM:180, heightMM:240},
    color:'gray', labels:true, header:true, project:'', pages:1
  };
  const LIMITS = {mobile:16, desktop:9, custom:16};
  const DEV = {
    mobile:{ratio:2.03, gap:8},
    desktop:{ratio:0.045+0.625, gap:10}
  };
  function getDevSpec(kind, s){
    if(kind==='custom'){
      const w = s.custom.widthMM||180, h = s.custom.heightMM||240;
      return {ratio: h/w, gap:10};
    }
    return DEV[kind];
  }

  /* ---------- Persistencia ---------- */
  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return;
      const saved = JSON.parse(raw);
      if(!saved || typeof saved!=='object') return;
      for(const k of ['sheet','color','labels','header','project','pages']){
        if(k in saved) state[k]=saved[k];
      }
      for(const k of ['mobile','desktop','custom']){
        if(saved[k] && typeof saved[k]==='object') Object.assign(state[k], saved[k]);
      }
    }catch(e){}
  }
  function saveState(){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){}
  }

  /* ---------- Maquetación ---------- */
  function fit(kind, n, orient, s){
    const W = orient==='l'?A4.h:A4.w, H = orient==='l'?A4.w:A4.h;
    const m = 12, head = s.header?17:0, labelH = s.labels?8:2;
    const aw = W-2*m, ah = H-2*m-head;
    const {ratio, gap} = getDevSpec(kind, s);
    let best=null;
    for(let cols=1; cols<=n; cols++){
      const rows = Math.ceil(n/cols);
      const cw = (aw-gap*(cols-1))/cols;
      const ch = (ah-gap*(rows-1))/rows;
      const w = Math.min(cw, (ch-labelH)/ratio);
      if(w>0 && (!best || w>best.w+0.01)) best={cols,rows,w};
    }
    return {...best, W,H,m,head,labelH,aw,ah,gap,ratio,orient};
  }
  function layout(kind, s){
    const cfg = s[kind];
    const n = cfg.count;
    if(cfg.orient!=='auto') return fit(kind,n,cfg.orient,s);
    const p = fit(kind,n,'p',s), l = fit(kind,n,'l',s);
    // preferencia leve: vertical para móvil, horizontal para escritorio/personalizado
    const bias = kind==='mobile'?1.04:0.96;
    return (l.w > p.w*bias) ? l : p;
  }

  /* ---------- Primitivas (en mm) ---------- */
  function sheetOps(kind, s, startIndex){
    const L = layout(kind, s);
    const pal = palettes[s.color];
    const ops = [];
    const cfg = s[kind];

    if(s.header) drawHeader(ops, L, kind, s, pal);

    const devH = L.w*L.ratio;
    const cellH = devH + L.labelH;
    const totalH = L.rows*cellH + (L.rows-1)*L.gap;
    const y0 = L.m + L.head + (L.ah-totalH)/2;
    let idx = 0;
    for(let r=0;r<L.rows;r++){
      const inRow = Math.min(L.cols, cfg.count - r*L.cols);
      const rowW = inRow*L.w + (inRow-1)*L.gap;
      const x0 = L.m + (L.aw-rowW)/2;
      for(let c=0;c<inRow;c++){
        const x = x0 + c*(L.w+L.gap), y = y0 + r*(cellH+L.gap);
        if(kind==='mobile') drawPhone(ops,x,y,L.w,cfg,pal);
        else if(kind==='desktop') drawBrowser(ops,x,y,L.w,cfg,pal);
        else drawCustomFrame(ops,x,y,L.w,L.ratio,cfg,pal);
        if(s.labels) drawLabel(ops,x,y+devH,L.w,startIndex+idx+1,pal);
        idx++;
      }
    }
    return {ops, L};
  }

  function drawHeader(ops, L, kind, s, pal){
    const y = L.m + 7, x = L.m, w = L.aw;
    const title = kind==='mobile' ? 'Wireframes móvil'
      : kind==='desktop' ? 'Wireframes escritorio'
      : `Wireframes${s.custom.name ? ': '+s.custom.name : ' personalizado'}`;
    ops.push({t:'text',x,y,s:title,size:10,color:pal.frame,bold:true});
    const fields = [
      ['Proyecto', 0.30, 0.62, s.project],
      ['Flujo', 0.645, 0.80],
      ['Fecha', 0.825, 0.935],
      ['Hoja', 0.955, 1]
    ];
    // en horizontal hay más sitio; el título ocupa ~26%
    fields.forEach(([lab,a,b,val])=>{
      const fx = x + w*a, fe = x + w*b;
      ops.push({t:'text',x:fx,y,s:lab,size:7,color:pal.text});
      const lx = fx + lab.length*7*PT*0.56 + 1.5;
      ops.push({t:'line',x1:lx,y1:y+0.8,x2:fe,y2:y+0.8,stroke:pal.soft,lw:(0.2)*LW});
      if(val) ops.push({t:'text',x:lx+1,y:y-0.3,s:val,size:9,color:'#333b41'});
    });
    ops.push({t:'line',x1:x,y1:L.m+11.5,x2:x+w,y2:L.m+11.5,stroke:pal.grid,lw:(0.2)*LW});
  }

  function drawLabel(ops,x,y,w,n,pal){
    const by = y + 5.6;
    ops.push({t:'text',x,y:by,s:String(n).padStart(2,'0'),size:7,color:pal.text,bold:true});
    ops.push({t:'line',x1:x+5.5,y1:by+0.6,x2:x+w,y2:by+0.6,stroke:pal.soft,lw:(0.2)*LW});
  }

  // Extensión horizontal de un rect redondeado a la altura yy
  function span(x,y,w,h,r,yy){
    let dx=0;
    const top=y+r, bot=y+h-r;
    if(yy<top){ const d=top-yy; dx = r-Math.sqrt(Math.max(0,r*r-d*d)); }
    else if(yy>bot){ const d=yy-bot; dx = r-Math.sqrt(Math.max(0,r*r-d*d)); }
    return [x+dx, x+w-dx];
  }
  function vspan(x,y,w,h,r,xx){
    const [a,b] = span(y,x,h,w,r,xx); return [a,b];
  }

  function drawBackground(ops,x,y,w,h,r,bg,pal,step){
    if(bg==='dots'){
      const nx=Math.floor(w/step), ny=Math.floor(h/step);
      const ox = x+(w-nx*step)/2, oy=y+(h-ny*step)/2;
      for(let i=0;i<=nx;i++) for(let j=0;j<=ny;j++){
        const px=ox+i*step, py=oy+j*step;
        const [a,b]=span(x,y,w,h,r,py);
        if(px>a+0.6 && px<b-0.6 && py>y+0.6 && py<y+h-0.6)
          ops.push({t:'circle',x:px,y:py,r:0.2*LW,fill:pal.grid});
      }
    } else if(bg==='grid'){
      const nx=Math.floor(w/step), ny=Math.floor(h/step);
      const ox = x+(w-nx*step)/2, oy=y+(h-ny*step)/2;
      for(let j=0;j<=ny;j++){
        const py=oy+j*step; if(py<=y+0.3||py>=y+h-0.3) continue;
        const [a,b]=span(x,y,w,h,r,py);
        ops.push({t:'line',x1:a,y1:py,x2:b,y2:py,stroke:pal.grid,lw:(0.1)*LW});
      }
      for(let i=0;i<=nx;i++){
        const px=ox+i*step; if(px<=x+0.3||px>=x+w-0.3) continue;
        const [a,b]=vspan(x,y,w,h,r,px);
        ops.push({t:'line',x1:px,y1:a,x2:px,y2:b,stroke:pal.grid,lw:(0.1)*LW});
      }
    }
  }

  function drawPhone(ops,x,y,w,cfg,pal){
    const h = w*2.03, R = w*0.14, ins = w*0.04;
    const sx=x+ins, sy=y+ins, sw=w-2*ins, sh=h-2*ins, sr=R-ins;
    const step = w>70 ? 5 : 4;
    drawBackground(ops,sx,sy,sw,sh,sr,cfg.bg==='cols'?'dots':cfg.bg,pal,step);
    if(cfg.chrome){
      // botones laterales
      const o=0.7;
      ops.push({t:'line',x1:x+w+o,y1:y+h*0.24,x2:x+w+o,y2:y+h*0.34,stroke:pal.frame,lw:(0.6)*LW});
      ops.push({t:'line',x1:x-o,y1:y+h*0.20,x2:x-o,y2:y+h*0.25,stroke:pal.frame,lw:(0.6)*LW});
      ops.push({t:'line',x1:x-o,y1:y+h*0.27,x2:x-o,y2:y+h*0.32,stroke:pal.frame,lw:(0.6)*LW});
    }
    ops.push({t:'rect',x,y,w,h,r:R,stroke:pal.frame,lw:(0.35)*LW});
    ops.push({t:'rect',x:sx,y:sy,w:sw,h:sh,r:sr,stroke:pal.soft,lw:(0.2)*LW});
    if(cfg.chrome){
      const iw=w*0.27, ih=w*0.075;
      ops.push({t:'rect',x:x+(w-iw)/2,y:sy+w*0.03,w:iw,h:ih,r:ih/2,fill:pal.fill});
      const hw=w*0.32;
      ops.push({t:'line',x1:x+(w-hw)/2,y1:sy+sh-w*0.04,x2:x+(w+hw)/2,y2:sy+sh-w*0.04,stroke:pal.frame,lw:Math.max(0.4,w*0.009)*LW,cap:true});
    }
  }

  function drawBrowser(ops,x,y,w,cfg,pal){
    const barH = cfg.chrome ? w*0.045 : 0;
    const ch = w*0.625, h = barH+ch, R = Math.max(1, w*0.012);
    const cx=x, cy=y+barH;
    if(cfg.bg==='cols'){
      const m=w*0.05, g=w*0.016, colW=(w-2*m-11*g)/12;
      for(let i=0;i<12;i++){
        const a=cx+m+i*(colW+g);
        ops.push({t:'line',x1:a,y1:cy+0.4,x2:a,y2:cy+ch-0.4,stroke:pal.grid,lw:(0.12)*LW,dash:[0.8,0.8]});
        ops.push({t:'line',x1:a+colW,y1:cy+0.4,x2:a+colW,y2:cy+ch-0.4,stroke:pal.grid,lw:(0.12)*LW,dash:[0.8,0.8]});
      }
    } else {
      drawBackground(ops,cx,cy,w,ch,cfg.chrome?0:R,cfg.bg,pal, w>150?5:4);
    }
    ops.push({t:'rect',x,y,w,h,r:R,stroke:pal.frame,lw:(0.35)*LW});
    if(cfg.chrome){
      ops.push({t:'line',x1:x,y1:y+barH,x2:x+w,y2:y+barH,stroke:pal.frame,lw:(0.25)*LW});
      const cr=barH*0.13;
      for(let i=0;i<3;i++) ops.push({t:'circle',x:x+barH*0.6+i*barH*0.45,y:y+barH/2,r:cr,stroke:pal.frame,lw:(0.2)*LW});
      const uh=barH*0.56;
      ops.push({t:'rect',x:x+w*0.2,y:y+(barH-uh)/2,w:w*0.6,h:uh,r:uh/2,stroke:pal.soft,lw:(0.2)*LW});
    }
  }

  function drawCustomFrame(ops,x,y,w,ratio,cfg,pal){
    const h = w*ratio;
    const barH = cfg.chrome ? Math.min(h*0.06, w*0.07) : 0;
    const R = Math.max(1, w*0.02);
    const cx=x, cy=y+barH, cw=w, ch=h-barH;
    drawBackground(ops,cx,cy,cw,ch,cfg.chrome?0:R,cfg.bg==='cols'?'dots':cfg.bg,pal, w>120?5:4);
    ops.push({t:'rect',x,y,w,h,r:R,stroke:pal.frame,lw:(0.35)*LW});
    if(cfg.chrome){
      ops.push({t:'line',x1:x,y1:y+barH,x2:x+w,y2:y+barH,stroke:pal.frame,lw:(0.25)*LW});
    }
  }

  /* ---------- Render SVG ---------- */
  function toSVG(ops,W,H){
    const out=[`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm" role="img" aria-label="Vista previa de la hoja A4"><rect width="${W}" height="${H}" fill="#fff"/>`];
    const f=(n)=>+n.toFixed(3);
    for(const o of ops){
      if(o.t==='rect'){
        out.push(`<rect x="${f(o.x)}" y="${f(o.y)}" width="${f(o.w)}" height="${f(o.h)}" rx="${f(o.r||0)}" fill="${o.fill||'none'}" ${o.stroke?`stroke="${o.stroke}" stroke-width="${o.lw}"`:''}/>`);
      } else if(o.t==='line'){
        out.push(`<line x1="${f(o.x1)}" y1="${f(o.y1)}" x2="${f(o.x2)}" y2="${f(o.y2)}" stroke="${o.stroke}" stroke-width="${o.lw}"${o.dash?` stroke-dasharray="${o.dash.join(' ')}"`:''}${o.cap?' stroke-linecap="round"':''}/>`);
      } else if(o.t==='circle'){
        out.push(`<circle cx="${f(o.x)}" cy="${f(o.y)}" r="${f(o.r)}" fill="${o.fill||'none'}"${o.stroke?` stroke="${o.stroke}" stroke-width="${o.lw}"`:''}/>`);
      } else if(o.t==='text'){
        const t=o.s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
        out.push(`<text x="${f(o.x)}" y="${f(o.y)}" font-family="Helvetica, Arial, sans-serif" font-size="${f(o.size*PT)}" font-weight="${o.bold?700:400}" fill="${o.color}">${t}</text>`);
      }
    }
    out.push('</svg>');
    return out.join('');
  }

  /* ---------- Render PDF ---------- */
  function drawPDF(doc, ops){
    for(const o of ops){
      if(o.t==='rect'){
        if(o.fill) doc.setFillColor(o.fill);
        if(o.stroke){ doc.setDrawColor(o.stroke); doc.setLineWidth(o.lw); }
        const style = o.fill && o.stroke ? 'FD' : (o.fill ? 'F' : 'S');
        if(o.r) doc.roundedRect(o.x,o.y,o.w,o.h,o.r,o.r,style);
        else doc.rect(o.x,o.y,o.w,o.h,style);
      } else if(o.t==='line'){
        doc.setDrawColor(o.stroke); doc.setLineWidth(o.lw);
        doc.setLineCap(o.cap?'round':'butt');
        if(o.dash) doc.setLineDashPattern(o.dash,0);
        doc.line(o.x1,o.y1,o.x2,o.y2);
        if(o.dash) doc.setLineDashPattern([],0);
      } else if(o.t==='circle'){
        if(o.fill){ doc.setFillColor(o.fill); doc.circle(o.x,o.y,o.r,'F'); }
        else { doc.setDrawColor(o.stroke); doc.setLineWidth(o.lw); doc.circle(o.x,o.y,o.r,'S'); }
      } else if(o.t==='text'){
        doc.setFont('helvetica', o.bold?'bold':'normal');
        doc.setFontSize(o.size); doc.setTextColor(o.color);
        doc.text(o.s,o.x,o.y);
      }
    }
  }

  function buildPDF(kinds){
    const { jsPDF } = window.jspdf;
    let doc=null, n={mobile:0,desktop:0,custom:0};
    for(const kind of kinds){
      for(let p=0;p<state.pages;p++){
        const {ops,L} = sheetOps(kind, state, n[kind]);
        n[kind]+=state[kind].count;
        if(!doc) doc = new jsPDF({orientation:L.orient, unit:'mm', format:'a4'});
        else doc.addPage('a4', L.orient);
        drawPDF(doc, ops);
      }
    }
    doc.setProperties({title:'Hojas de wireframe', creator:'Hojas de wireframe'});
    return doc;
  }

  /* ---------- Descarga ---------- */
  let downloads, standalone = !(window.claude && typeof window.claude.use==='function');
  if(!standalone){
    window.claude.use('downloads').then(d=>{ downloads=d; if(!d) disableDownloads(); });
  }
  function disableDownloads(){
    $('#dlOne').disabled = true; $('#dlBoth').disabled = true;
    $('#dlSVG').disabled = true; $('#dlPNG').disabled = true;
    setStatus('La descarga no está disponible en esta vista.');
  }
  function setStatus(t){ $('#status').textContent = t; }

  const KIND_LABEL = { mobile:'movil', desktop:'escritorio' };
  function kindLabel(kind){
    if(kind!=='custom') return KIND_LABEL[kind];
    return slugify(state.custom.name) || 'personalizado';
  }

  async function saveBlob(filename, blob){
    if(standalone){
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      setStatus('Descargado.');
      return;
    }
    if(!downloads){ disableDownloads(); return; }
    try{
      await downloads.save({filename, data: blob});
      setStatus('Descargado.');
    }catch(e){
      const c = e && e.code;
      if(c==='declined') setStatus('Descarga cancelada.');
      else if(c==='rate_limited') setStatus('Ya hay una descarga pendiente. Confírmala o espera un momento.');
      else disableDownloads();
    }
  }

  function currentSheetSVG(){
    const {ops,L} = sheetOps(state.sheet, state, 0);
    return { svg: toSVG(ops, L.W, L.H), W:L.W, H:L.H };
  }

  async function downloadSVG(){
    const {svg} = currentSheetSVG();
    const blob = new Blob([svg], {type:'image/svg+xml'});
    const slug = slugify(state.project) || 'wireframes';
    await saveBlob(`${slug}-${kindLabel(state.sheet)}.svg`, blob);
  }

  async function downloadPNG(){
    const {svg, W, H} = currentSheetSVG();
    const pxW = mmToPx(W), pxH = mmToPx(H);
    const svgBlob = new Blob([svg], {type:'image/svg+xml;charset=utf-8'});
    const url = URL.createObjectURL(svgBlob);
    try{
      const img = new Image();
      await new Promise((resolve,reject)=>{ img.onload=resolve; img.onerror=reject; img.src=url; });
      const canvas = document.createElement('canvas');
      canvas.width = pxW; canvas.height = pxH;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0,0,pxW,pxH);
      ctx.drawImage(img,0,0,pxW,pxH);
      const blob = await new Promise(res=>canvas.toBlob(res,'image/png'));
      const slug = slugify(state.project) || 'wireframes';
      await saveBlob(`${slug}-${kindLabel(state.sheet)}.png`, blob);
    }catch(e){
      setStatus('No se pudo generar el PNG.');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function download(kinds){
    if(!window.jspdf){ setStatus('El generador de PDF no ha cargado. Recarga la página.'); return; }
    const doc = buildPDF(kinds);
    const slug = slugify(state.project) || 'wireframes';
    const suffix = kinds.map(kindLabel).join('-');
    const filename = `${slug}-${suffix}.pdf`;
    if(standalone){ doc.save(filename); setStatus('PDF descargado.'); return; }
    if(!downloads){ disableDownloads(); return; }
    try{
      await downloads.save({filename, data: doc.output('blob')});
      setStatus('PDF descargado.');
    }catch(e){
      const c = e && e.code;
      if(c==='declined') setStatus('Descarga cancelada.');
      else if(c==='rate_limited') setStatus('Ya hay una descarga pendiente. Confírmala o espera un momento.');
      else disableDownloads();
    }
  }
  $('#dlOne').addEventListener('click',()=>download([state.sheet]));
  $('#dlBoth').addEventListener('click',()=>download(['mobile','desktop']));
  $('#dlSVG').addEventListener('click',downloadSVG);
  $('#dlPNG').addEventListener('click',downloadPNG);

  /* ---------- UI ---------- */
  function syncControls(){
    const k=state.sheet, cfg=state[k];
    const r=$('#count'); r.max=LIMITS[k]; r.value=cfg.count;
    $('#countOut').textContent=cfg.count;
    $('#countHint').textContent=`de 1 a ${LIMITS[k]}`;
    document.querySelector(`input[name=orient][value="${cfg.orient}"]`).checked=true;
    $('#colsOpt').hidden = k!=='desktop';
    document.querySelector(`input[name=bg][value="${cfg.bg}"]`).checked=true;
    $('#chrome').checked=cfg.chrome;
    $('#chromeLbl').textContent = k==='mobile' ? 'Isla, botones y barra de inicio' : k==='desktop' ? 'Barra del navegador' : 'Barra superior';
    $('#customOpts').hidden = k!=='custom';
    if(k==='custom'){
      $('#customName').value = state.custom.name;
      $('#customW').value = state.custom.widthMM;
      $('#customH').value = state.custom.heightMM;
    }
  }
  function syncUniversalControls(){
    document.querySelector(`input[name=sheet][value="${state.sheet}"]`).checked=true;
    document.querySelector(`input[name=color][value="${state.color}"]`).checked=true;
    $('#labels').checked = state.labels;
    $('#header').checked = state.header;
    $('#project').value = state.project;
    $('#pages').value = state.pages;
  }
  function render(){
    const {ops,L}=sheetOps(state.sheet,state,0);
    const paper=$('#paper');
    paper.style.setProperty('--ratio', `${L.W}/${L.H}`);
    paper.innerHTML=toSVG(ops,L.W,L.H);
    const devW = Math.round(L.w), devH = Math.round(L.w*L.ratio);
    const total = state.pages>1 ? `, ${state.pages} páginas` : '';
    $('#meta').textContent = `A4 ${L.orient==='l'?'horizontal':'vertical'}, ${L.cols}×${L.rows}, cada pantalla mide ${devW}×${devH} mm${total}`;
    saveState();
  }
  document.querySelectorAll('input[name=sheet]').forEach(i=>i.addEventListener('change',e=>{state.sheet=e.target.value;syncControls();render();}));
  $('#count').addEventListener('input',e=>{state[state.sheet].count=+e.target.value;$('#countOut').textContent=e.target.value;render();});
  document.querySelectorAll('input[name=orient]').forEach(i=>i.addEventListener('change',e=>{state[state.sheet].orient=e.target.value;render();}));
  document.querySelectorAll('input[name=bg]').forEach(i=>i.addEventListener('change',e=>{state[state.sheet].bg=e.target.value;render();}));
  document.querySelectorAll('input[name=color]').forEach(i=>i.addEventListener('change',e=>{state.color=e.target.value;render();}));
  $('#chrome').addEventListener('change',e=>{state[state.sheet].chrome=e.target.checked;render();});
  $('#labels').addEventListener('change',e=>{state.labels=e.target.checked;render();});
  $('#header').addEventListener('change',e=>{state.header=e.target.checked;render();});
  $('#project').addEventListener('input',e=>{state.project=e.target.value.trim();render();});
  $('#pages').addEventListener('input',e=>{const v=Math.max(1,Math.min(30,parseInt(e.target.value)||1));state.pages=v;render();});
  $('#customName').addEventListener('input',e=>{state.custom.name=e.target.value.trim();render();});
  $('#customW').addEventListener('input',e=>{state.custom.widthMM=clamp(parseFloat(e.target.value)||180,10,400);render();});
  $('#customH').addEventListener('input',e=>{state.custom.heightMM=clamp(parseFloat(e.target.value)||240,10,400);render();});

  loadState();
  syncUniversalControls();
  syncControls();
  render();
})();
