// ---------------------------------------------------------------------------
// v42 — Estilo "AtlasGR Executive Intelligence" do modelo visual exportado:
// CSS (tokens claro/escuro, hero editorial, bento executivo, cockpit,
// seções gráfico-primeiro com gaveta de dados, tabelas) e o JS que roda
// DENTRO do HTML exportado (animações, ordenação, filtros, foco conectado,
// tema, fundo 3D). Separado de relatorio-visual-generico.js, que monta o
// HTML a partir dos dados — aqui só vive apresentação/comportamento.
// Tudo autocontido: o arquivo .html baixado funciona offline, sem CDN.
// ---------------------------------------------------------------------------

function relatorioVisualCss(marca) {
  return String.raw`
  :root{
    --brand:${marca.corPrimaria};--brand-2:${marca.corSecundaria1};--brand-3:${marca.corSecundaria2};--brand-active:#a83810;--gold:#f2ad16;
    --ok:#15845e;--warn:#e9a100;--bad:#c8493d;--blue:#476f9f;
    --bg:#f3efeb;--bg-top:#faf8f6;--paper:#fffdfa;--surface:#ffffff;--surface-2:#f7f3f0;--surface-3:#ece6e1;
    --ink:#171210;--ink-2:#5e5550;--muted:#8b817b;--dark:#17100d;--dark-2:#2b1912;--on-dark:#ffffff;--on-dark-2:rgba(255,255,255,.62);
    --line:rgba(31,21,17,.10);--line-2:rgba(31,21,17,.18);--soft:rgba(255,86,24,.08);--soft-glow:rgba(255,86,24,.28);--pale:#fff0e9;
    --shadow:0 24px 70px rgba(52,34,25,.08),0 4px 16px rgba(52,34,25,.04);--shadow-hover:0 32px 90px rgba(52,34,25,.14),0 8px 26px rgba(52,34,25,.07);
    --thead:#1d1410;--thead-ink:rgba(255,255,255,.7);
    --font:"Montserrat",ui-sans-serif,system-ui,sans-serif;--mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
    --maxw:1420px;--radius:28px;--radius-sm:18px;
  }
  :root[data-theme="dark"]{
    --bg:#0f0b09;--bg-top:#15100d;--paper:#181211;--surface:#1c1513;--surface-2:#241c19;--surface-3:#2f2521;
    --ink:#f7f3f1;--ink-2:#b3a8a1;--muted:#8d817a;--dark:#0b0806;--dark-2:#1c120e;
    --line:rgba(255,255,255,.09);--line-2:rgba(255,255,255,.18);--soft:rgba(255,86,24,.16);--soft-glow:rgba(255,86,24,.35);--pale:#3a1d12;--brand-active:#ff9d70;
    --shadow:0 24px 70px rgba(0,0,0,.55),0 4px 16px rgba(0,0,0,.35);--shadow-hover:0 32px 90px rgba(0,0,0,.7),0 8px 26px rgba(0,0,0,.4);
    --thead:#0b0806;--thead-ink:rgba(255,255,255,.62);
  }
  @media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
    --bg:#0f0b09;--bg-top:#15100d;--paper:#181211;--surface:#1c1513;--surface-2:#241c19;--surface-3:#2f2521;
    --ink:#f7f3f1;--ink-2:#b3a8a1;--muted:#8d817a;--dark:#0b0806;--dark-2:#1c120e;
    --line:rgba(255,255,255,.09);--line-2:rgba(255,255,255,.18);--soft:rgba(255,86,24,.16);--soft-glow:rgba(255,86,24,.35);--pale:#3a1d12;--brand-active:#ff9d70;
    --shadow:0 24px 70px rgba(0,0,0,.55),0 4px 16px rgba(0,0,0,.35);--shadow-hover:0 32px 90px rgba(0,0,0,.7),0 8px 26px rgba(0,0,0,.4);
    --thead:#0b0806;--thead-ink:rgba(255,255,255,.62);
  }}
  *{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:82px}[hidden]{display:none!important}
  body{margin:0;font-family:var(--font);font-size:14px;color:var(--ink);background:radial-gradient(circle at 12% -5%,rgba(255,86,24,.08),transparent 31rem),linear-gradient(180deg,var(--bg-top) 0%,var(--bg) 46%,var(--bg-top) 100%);-webkit-font-smoothing:antialiased;padding-bottom:72px;min-height:100vh}
  h1,h2,h3,h4,h5{margin:0;text-wrap:balance}a{color:var(--brand)}button{font-family:inherit;cursor:pointer}
  ::-webkit-scrollbar{width:9px;height:9px}::-webkit-scrollbar-thumb{background:var(--line-2);border-radius:999px}
  .mono{font-family:var(--mono)}
  .anima{transition:opacity .4s ease,transform .4s ease}html.anima-on .anima{opacity:0;transform:translateY(12px)}html.anima-on .anima.visivel{opacity:1;transform:none}
  #bg3d{position:fixed;inset:0;z-index:0;pointer-events:none;opacity:.55}body>*{position:relative;z-index:1}body>#bg3d{z-index:0}

  .letterhead{background:color-mix(in srgb,var(--paper) 96%,transparent);border-bottom:1px solid var(--line);backdrop-filter:blur(8px)}
  .letterhead-inner{max-width:var(--maxw);margin:0 auto;padding:16px 34px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
  .letterhead-brand{display:flex;align-items:center;gap:16px;min-width:0}.letterhead-brand svg{width:124px;height:auto;display:block}
  .letterhead-divider{width:1.5px;align-self:stretch;min-height:36px;background:var(--line-2)}
  .letterhead-tagline{font-size:9px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);max-width:250px;line-height:1.5}
  .letterhead-ref{display:flex;align-items:center;gap:14px}.letterhead-ref .ref{font-size:11px;color:var(--muted);text-align:right;line-height:1.5}.letterhead-ref .ref strong{display:block;color:var(--ink);font-size:12px;font-weight:800}
  .btn-imprimir{border:0;background:var(--dark);color:#fff;font-weight:800;font-size:11px;padding:9px 16px;border-radius:999px;transition:background .18s,transform .12s}.btn-imprimir:hover{background:var(--brand)}.btn-imprimir:active{transform:scale(.97)}

  .hero{position:relative;overflow:hidden;color:#fff;min-height:440px;padding:64px 34px 104px;background:radial-gradient(circle at 78% 36%,rgba(255,95,29,.36),transparent 22rem),radial-gradient(circle at 92% 85%,rgba(242,173,22,.11),transparent 23rem),linear-gradient(120deg,#120c09 0%,#20130f 56%,#4c2114 100%)}
  .hero::before{content:"";position:absolute;inset:0;opacity:.36;background:linear-gradient(rgba(255,255,255,.024) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.024) 1px,transparent 1px);background-size:54px 54px;pointer-events:none}
  .hero::after{content:"";position:absolute;right:-16%;top:-48%;width:860px;height:860px;background:radial-gradient(circle,rgba(255,86,24,.38),transparent 64%);pointer-events:none}
  .hero-inner{max-width:var(--maxw);margin:0 auto;position:relative;z-index:1;display:grid;grid-template-columns:minmax(0,1.04fr) minmax(460px,.96fr);gap:70px;align-items:center}
  .hero-eyebrow{text-transform:uppercase;letter-spacing:.24em;font-size:10px;font-weight:900;color:#ffb89c;margin:0 0 18px}
  .hero h1{font-size:clamp(40px,4.6vw,68px);line-height:.96;letter-spacing:-.055em;font-weight:800;margin:0 0 22px;max-width:800px}.hero h1 em{font-style:normal;color:#ff7a22}
  .hero .subtitulo{margin:0;font-size:15px;line-height:1.7;max-width:640px;color:rgba(255,255,255,.7)}
  .hero-note{display:flex;gap:9px;align-items:center;margin-top:26px;color:rgba(255,255,255,.58);font-size:10.5px;font-weight:700}.hero-note i{width:7px;height:7px;border-radius:50%;background:#15845e;box-shadow:0 0 0 5px rgba(21,132,94,.16)}
  .placar{display:grid;grid-template-columns:1.3fr .7fr;gap:14px}
  .placar-principal{border-radius:30px;padding:26px;background:linear-gradient(150deg,rgba(255,255,255,.12),rgba(255,255,255,.055));border:1px solid rgba(255,255,255,.15);position:relative;overflow:hidden;min-height:260px;display:flex;flex-direction:column;justify-content:space-between}
  .placar-principal::after{content:"";position:absolute;width:220px;height:220px;border-radius:50%;right:-80px;bottom:-100px;background:radial-gradient(circle,rgba(255,86,24,.4),transparent 68%)}
  .placar-principal strong{font-size:clamp(44px,4.4vw,64px);line-height:.95;letter-spacing:-.06em;color:#fff;font-variant-numeric:tabular-nums;display:block;position:relative}
  .placar-principal .rot{display:block;font-size:10px;margin-top:11px;color:#ffb79a;letter-spacing:.17em;text-transform:uppercase;font-weight:800}
  .placar-principal p{margin:26px 0 0;padding-top:16px;border-top:1px solid rgba(255,255,255,.12);font-size:11.5px;line-height:1.55;color:rgba(255,255,255,.7);position:relative}
  .placar-minis{display:grid;grid-template-columns:1fr;gap:10px}
  .placar-minis>div{border-radius:20px;padding:16px 18px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.13)}
  .placar-minis>div:first-child{background:linear-gradient(145deg,var(--brand),#d94510);border-color:rgba(255,255,255,.17);box-shadow:0 24px 50px rgba(255,86,24,.18)}
  .placar-minis strong{display:block;font-size:18px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}.placar-minis span{display:block;font-size:8.5px;text-transform:uppercase;letter-spacing:.14em;font-weight:800;opacity:.8;margin-top:4px}

  .sumario{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--paper) 93%,transparent);backdrop-filter:blur(14px);border-bottom:1px solid var(--line);box-shadow:0 10px 35px rgba(43,28,21,.05)}
  .sumario-inner{max-width:var(--maxw);margin:0 auto;padding:11px 34px;display:flex;gap:6px;overflow-x:auto;scrollbar-width:thin}
  .sumario a{white-space:nowrap;text-decoration:none;color:var(--ink-2);font-size:10.5px;font-weight:800;padding:8px 12px;border-radius:999px;border:1px solid transparent;transition:background .18s,color .18s}
  .sumario a:hover{background:var(--soft);color:var(--brand)}.sumario a.ativo{background:var(--dark);color:#fff;box-shadow:0 6px 16px rgba(23,16,13,.12)}
  .sumario a .n{display:inline-block;min-width:18px;height:18px;line-height:18px;border-radius:999px;background:var(--surface-3);color:var(--brand-active);font-size:9.5px;text-align:center;margin-right:6px}.sumario a.ativo .n{background:rgba(255,255,255,.22);color:#fff}

  .wrap{max-width:var(--maxw);margin:0 auto;padding:0 34px}
  .kicker{font-size:10px;letter-spacing:.16em;text-transform:uppercase;font-weight:900;color:var(--brand);margin-bottom:8px}
  .comando{margin:-54px 0 54px;position:relative;z-index:5}
  .comando-topo{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:18px;padding:0 8px}
  .comando-topo h2{font-size:clamp(26px,2.8vw,40px);line-height:1.05;letter-spacing:-.05em;color:var(--ink);max-width:820px}
  .comando-topo p{margin:0;max-width:390px;font-size:12px;line-height:1.65;color:var(--ink-2)}
  .bento{display:grid;grid-template-columns:1.35fr .85fr 1fr;grid-auto-rows:minmax(170px,auto);gap:14px}
  .tile{border-radius:var(--radius);border:1px solid var(--line);background:var(--paper);box-shadow:var(--shadow);padding:24px;position:relative;overflow:hidden;transition:transform .24s ease,box-shadow .24s ease,border-color .24s ease}
  .tile:hover{transform:translateY(-3px);box-shadow:var(--shadow-hover);border-color:rgba(255,86,24,.18)}
  .tile-rotulo{font-size:9px;text-transform:uppercase;letter-spacing:.14em;font-weight:900;color:var(--muted)}
  .tile-valor{font-size:42px;line-height:1;letter-spacing:-.06em;font-weight:800;margin-top:16px;color:var(--ink);font-variant-numeric:tabular-nums;word-break:break-word}
  .tile-meta{font-size:11px;line-height:1.55;color:var(--ink-2);margin-top:10px}
  .tile-escuro{grid-row:1/3;background:linear-gradient(145deg,var(--dark),var(--dark-2));color:#fff;border-color:rgba(255,255,255,.05);padding:30px;display:flex;flex-direction:column}
  .tile-escuro::before{content:"";position:absolute;width:280px;height:280px;border-radius:50%;right:-130px;top:-120px;background:radial-gradient(circle,rgba(255,86,24,.38),transparent 68%)}
  .tile-escuro .tile-rotulo{color:#ffb89b}.tile-escuro .tile-valor{font-size:54px;color:#fff;margin-top:24px}.tile-escuro .tile-meta{color:rgba(255,255,255,.62);max-width:330px}
  .tile-escuro-pe{margin-top:auto;display:grid;grid-template-columns:1fr 1fr;gap:10px;border-top:1px solid rgba(255,255,255,.12);padding-top:18px;position:relative}
  .tile-escuro-pe span{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.45)}.tile-escuro-pe b{display:block;font-family:var(--mono);font-size:14px;color:#fff;margin-top:3px}
  .tile-laranja{background:linear-gradient(145deg,var(--brand),#dc460e);color:#fff;border-color:transparent}.tile-laranja .tile-rotulo{color:rgba(255,255,255,.72)}.tile-laranja .tile-valor{color:#fff;font-size:38px}.tile-laranja .tile-meta{color:rgba(255,255,255,.85)}
  .tile-suave .tile-valor{font-size:36px}.tile-verde{background:linear-gradient(160deg,var(--paper),color-mix(in srgb,var(--ok) 6%,var(--paper)))}.tile-ambar{background:linear-gradient(160deg,var(--paper),color-mix(in srgb,var(--gold) 8%,var(--paper)))}
  .tile-confianca{display:flex;align-items:center;gap:14px;background:linear-gradient(145deg,var(--surface),var(--surface-2))}
  .tile-confianca .selo{width:56px;height:56px;border-radius:18px;display:grid;place-items:center;background:color-mix(in srgb,var(--ok) 14%,var(--surface));color:var(--ok);font-size:23px;font-weight:900;flex:none}
  .tile-confianca.alerta .selo{background:color-mix(in srgb,var(--warn) 16%,var(--surface));color:#a66b00}
  .tile-confianca b{display:block;font-size:14px;margin-bottom:4px}.tile-confianca p{margin:0;color:var(--ink-2);font-size:10.5px;line-height:1.5}

  h2.titulo-secao{font-size:12px;font-weight:900;margin:34px 0 4px;text-transform:uppercase;letter-spacing:.12em;display:flex;align-items:baseline;gap:10px;color:var(--muted)}
  p.sub-secao{margin:0 0 14px;font-size:11.5px;color:var(--ink-2)}
  .painel{background:var(--paper);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:24px 26px}
  .btn-gaveta{background:var(--dark);color:#fff;border:0;padding:9px 14px;border-radius:999px;font-size:11px;font-weight:800;margin-bottom:14px;transition:background .18s}.btn-gaveta:hover{background:var(--brand)}
  .gaveta-kpis{display:none}.gaveta-kpis.aberta{display:block}
  .alerta{display:flex;gap:12px;align-items:flex-start;background:color-mix(in srgb,var(--warn) 12%,var(--paper));border:1px solid color-mix(in srgb,var(--warn) 45%,var(--line));border-radius:16px;padding:14px 16px;margin-bottom:16px;font-size:12.5px}.alerta ul{margin:6px 0 0;padding-left:18px}.alerta-icone{font-size:18px}
  .kpis{display:flex;flex-wrap:wrap;gap:12px;perspective:1100px}
  .kpi{flex:1 1 180px;min-width:180px;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-sm);padding:16px 18px;position:relative;overflow:hidden;cursor:pointer;transform-style:preserve-3d;transition:transform .3s cubic-bezier(.2,.9,.25,1),box-shadow .3s ease,border-color .25s ease}
  .kpi:hover{transform:translateY(-4px);box-shadow:0 24px 48px -26px var(--soft-glow),var(--shadow);border-color:color-mix(in srgb,var(--brand) 45%,var(--line))}
  .kpi-destaque{flex:1 1 220px;background:linear-gradient(180deg,var(--surface) 0%,var(--surface-2) 100%)}
  .kpi-destaque::before{content:"";position:absolute;left:18px;right:18px;top:0;height:3px;border-radius:0 0 3px 3px;background:linear-gradient(90deg,var(--brand),var(--gold))}
  .kpi-rotulo{font-size:10px;text-transform:uppercase;letter-spacing:.1em;font-weight:900;color:var(--muted);margin-bottom:6px}
  .kpi-valor{font-family:var(--mono);font-size:23px;font-weight:800;color:var(--brand-active);letter-spacing:-.01em;font-variant-numeric:tabular-nums;line-height:1.1}.kpi-destaque .kpi-valor{font-size:30px}
  .kpi-desc{margin-top:8px;font-size:11.5px;line-height:1.45;color:var(--ink-2)}
  .kpi::after{content:"Copiado ✓";position:absolute;right:12px;top:10px;background:var(--brand);color:#fff;font-size:10px;font-weight:800;padding:3px 8px;border-radius:999px;opacity:0;transform:translateY(-4px);transition:opacity .18s,transform .18s;pointer-events:none}.kpi.copiado::after{opacity:1;transform:none}
  .kpis-sec{margin-top:12px}

  .capitulo{margin:64px -34px 26px;padding:34px 34px 30px;border-top:1px solid var(--line);border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:30px;align-items:end;background:linear-gradient(90deg,color-mix(in srgb,var(--paper) 55%,transparent),transparent)}
  .capitulo-num{font-family:var(--mono);font-size:10px;color:var(--brand);font-weight:800;letter-spacing:.1em}
  .capitulo h2{font-size:30px;letter-spacing:-.05em;margin:6px 0 0;line-height:1.05}.capitulo p{max-width:520px;margin:0;font-size:11.5px;line-height:1.65;color:var(--ink-2)}
  .capitulo.escuro{background:linear-gradient(120deg,var(--dark),var(--dark-2));color:#fff;border:0;border-radius:30px;margin-left:0;margin-right:0;padding:34px 38px;box-shadow:0 24px 60px rgba(35,22,16,.13)}
  .capitulo.escuro .capitulo-num{color:#ff9f78}.capitulo.escuro p{color:rgba(255,255,255,.6)}

  .cockpit{margin-top:6px}.ck-grid{display:grid;grid-template-columns:repeat(12,1fr);gap:14px}
  .ck-card{grid-column:span 12;background:var(--paper);border:1px solid var(--line);border-radius:26px;box-shadow:var(--shadow);padding:24px;position:relative;overflow:hidden;transition:border-color .25s}
  .ck-card:hover{border-color:color-mix(in srgb,var(--brand) 35%,var(--line))}
  .ck-card h3{font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.15em;color:var(--muted);margin:0 0 2px;display:flex;align-items:center;justify-content:space-between;gap:8px}
  .ck-ir{border:none;background:none;color:var(--brand-active);font-size:9.5px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;padding:0;opacity:.8}.ck-ir:hover{opacity:1;color:var(--brand)}
  .ck-legenda{font-size:11.5px;line-height:1.7;color:var(--ink-2);margin:10px 0 0}.ck-legenda b{color:var(--ink);font-weight:800}.ck-legenda .destaque{color:var(--brand-active);font-weight:800;font-family:var(--mono)}
  @media (min-width:820px){.ck-orbe{grid-column:span 4}.ck-mix{grid-column:span 8}.ck-trend{grid-column:span 7}.ck-funil{grid-column:span 5}.ck-foco{grid-column:span 12}}
  @media (min-width:1180px){.ck-orbe{grid-column:span 3}.ck-mix{grid-column:span 5}.ck-trend{grid-column:span 4}.ck-funil{grid-column:span 5}.ck-foco{grid-column:span 7}.ck-funil:last-of-type,.ck-foco:first-of-type{grid-column:span 12}}
  .ck-orbe{background:linear-gradient(145deg,var(--dark),var(--dark-2));color:#fff;border-color:transparent}.ck-orbe h3{color:#ffb89b}.ck-orbe .ck-legenda{color:rgba(255,255,255,.62)}.ck-orbe .ck-legenda b{color:#fff}
  .orbe-wrap{position:relative;display:grid;place-items:center;padding:6px 0 2px}
  .orbe{position:relative;width:158px;height:158px}.orbe svg{position:relative;z-index:1;transform:rotate(-90deg)}
  .orbe .aro{fill:none;stroke:rgba(255,255,255,.11);stroke-width:10}.orbe .arco{fill:none;stroke:url(#gradOrbe);stroke-width:10;stroke-linecap:round;transition:stroke-dashoffset 1.2s cubic-bezier(.2,.8,.2,1)}
  .orbe-valor{position:absolute;inset:0;display:grid;place-content:center;text-align:center;z-index:2}.orbe-valor .v{font-family:var(--mono);font-size:26px;font-weight:800;color:#fff;line-height:1;font-variant-numeric:tabular-nums}.orbe-valor .r{font-size:8.5px;font-weight:900;text-transform:uppercase;letter-spacing:.12em;color:#ffb89b;margin-top:5px}
  .mix-barra{display:flex;height:34px;border-radius:12px;overflow:hidden;border:1px solid var(--line);margin:12px 0 10px;background:var(--surface-2)}
  .mix-seg{position:relative;display:grid;place-items:center;color:#fff;font-family:var(--mono);font-size:11px;font-weight:800;cursor:pointer;transition:filter .2s;min-width:2px}.mix-seg:hover{filter:brightness(1.12)}
  .mix-legenda{display:flex;flex-wrap:wrap;gap:6px}
  .mix-item{display:inline-flex;align-items:center;gap:6px;font-size:10.5px;font-weight:700;color:var(--ink-2);background:var(--surface-2);border:1px solid var(--line);border-radius:999px;padding:4px 10px}
  .mix-ponto{width:8px;height:8px;border-radius:999px;flex-shrink:0}.mix-item b{font-family:var(--mono);color:var(--ink)}
  .spark{position:relative;margin-top:10px}.spark svg{width:100%;height:110px;display:block;overflow:visible}
  .spark .area{fill:url(#gradArea)}.spark .linha{fill:none;stroke:var(--brand);stroke-width:2.4;stroke-linejoin:round;stroke-linecap:round}
  .spark .pt{fill:var(--paper);stroke:var(--brand);stroke-width:2;cursor:pointer}.spark .pt:hover{fill:var(--brand)}
  .spark-tip{position:absolute;pointer-events:none;background:var(--ink);color:var(--bg);font-size:10.5px;font-weight:700;padding:5px 9px;border-radius:8px;white-space:nowrap;opacity:0;transform:translate(-50%,-130%);transition:opacity .15s;z-index:5}.spark-tip.on{opacity:1}
  .spark-eixo{display:flex;justify-content:space-between;font-size:9px;font-weight:800;color:var(--muted);margin-top:4px;letter-spacing:.04em}
  .funil3d{perspective:800px;margin-top:12px;display:flex;flex-direction:column;gap:7px}
  .fase{transform:rotateX(14deg);transform-origin:center top;transition:transform .3s,filter .3s;cursor:pointer}.fase:hover{transform:rotateX(4deg) translateY(-2px);filter:brightness(1.05)}
  .fase-topo{display:flex;justify-content:space-between;align-items:baseline;font-size:10.5px;font-weight:800;color:var(--ink-2);margin-bottom:3px}.fase-topo b{color:var(--ink);font-family:var(--mono)}
  .fase-barra{height:20px;border-radius:8px;background:linear-gradient(180deg,color-mix(in srgb,var(--brand-2) 92%,#fff),var(--brand) 60%,var(--brand-active));box-shadow:0 6px 12px -8px var(--soft-glow),inset 0 -2px 0 rgba(0,0,0,.18),inset 0 2px 0 rgba(255,255,255,.28);display:flex;align-items:center;justify-content:flex-end;padding-right:8px;color:#fff;font-family:var(--mono);font-size:10px;font-weight:800;min-width:34px}
  .fase.fria .fase-barra{background:linear-gradient(180deg,#a99e97,#8d817a 60%,#6f6560)}
  .ck-foco{background:linear-gradient(180deg,var(--paper),color-mix(in srgb,var(--brand) 3%,var(--paper)))}
  .foco-vazio{font-size:11.5px;color:var(--ink-2);line-height:1.55;margin-top:6px}
  .foco-topo{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:6px}.foco-nome{font-size:16px;font-weight:900;letter-spacing:-.01em;color:var(--ink)}
  .foco-limpar{border:1px solid var(--line);background:var(--surface);color:var(--ink-2);font-size:10px;font-weight:800;border-radius:999px;padding:4px 10px}.foco-limpar:hover{color:var(--brand)}
  .foco-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin-top:12px}
  .foco-bloco{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:11px 13px}.foco-bloco .origem{font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.09em;color:var(--brand-active);margin-bottom:7px;display:block}
  .foco-bloco dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:3px 10px;font-size:11px}.foco-bloco dt{color:var(--muted);font-weight:700}.foco-bloco dd{margin:0;text-align:right;font-family:var(--mono);font-weight:800;color:var(--ink)}
  tr.linha-foco td{background:color-mix(in srgb,var(--brand) 14%,var(--surface))!important}.barra-linha.linha-foco,.v-linha.linha-foco{background:color-mix(in srgb,var(--brand) 14%,var(--surface));outline:1px solid color-mix(in srgb,var(--brand) 45%,transparent)}

  .ia-insights-card{border-radius:30px;padding:28px;box-shadow:var(--shadow);background:var(--paper);border:1px solid var(--line);margin:18px 0 0;position:relative;overflow:hidden}
  .ia-insights-card::before{content:"";position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,var(--brand),var(--gold),var(--blue))}
  .ia-insights-header{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px}
  .ia-insights-badge{display:inline-flex;align-items:center;gap:6px;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.14em;color:var(--brand-active)}.ia-insights-badge .ia-sparkle{font-size:15px}
  .ia-nota{font-size:10px;color:var(--muted);font-weight:700}
  .ia-insights-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px}
  .ia-insights-coluna{border-radius:21px;padding:20px;background:var(--surface-2);border:1px solid var(--line);position:relative;overflow:hidden}
  .ia-insights-coluna::before{content:"";position:absolute;top:0;left:0;right:0;height:2px;background:var(--line-2)}.col-pontos-fortes::before{background:var(--ok)!important}.col-gargalos::before{background:var(--warn)!important}.col-acoes::before{background:var(--brand)!important}
  .ia-insights-coluna h4{font-size:13px;margin-bottom:13px;font-weight:900}.ia-insights-coluna ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}
  .ia-insights-coluna li{display:flex;align-items:flex-start;gap:8px;font-size:12px;line-height:1.58;color:var(--ink-2)}
  .ia-bullet{flex:0 0 18px;height:18px;border-radius:50%;font-size:10px;font-weight:900;display:inline-flex;align-items:center;justify-content:center;color:#fff}.ia-bullet.ok{background:var(--ok)}.ia-bullet.alerta{background:var(--warn)}.ia-bullet.acao{background:var(--brand)}

  .secao{background:var(--paper);border:1px solid var(--line);border-radius:30px;box-shadow:var(--shadow);margin-bottom:26px}
  .secao-head{display:flex;align-items:center;gap:12px;padding:21px 24px;border-bottom:1px solid var(--line);flex-wrap:wrap}
  .secao-num{flex:0 0 34px;width:34px;height:34px;border-radius:10px;background:var(--dark);color:#fff;font-weight:900;font-size:12px;display:inline-flex;align-items:center;justify-content:center}
  .secao-titulo{font-size:17px;font-weight:800;letter-spacing:-.035em;flex:1 1 auto;min-width:200px;color:var(--ink)}
  .contagem{font-size:9px;font-weight:800;color:var(--ink-2);background:var(--surface-3);border-radius:999px;padding:5px 9px;letter-spacing:.04em}
  .secao-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .filtro-input{border:1px solid var(--line);border-radius:999px;padding:7px 12px;font-size:11.5px;font-family:inherit;min-width:180px;background:var(--surface);color:var(--ink);outline:none;transition:border-color .18s,box-shadow .18s}.filtro-input::placeholder{color:var(--muted)}.filtro-input:focus{border-color:var(--brand);box-shadow:0 0 0 3px color-mix(in srgb,var(--brand) 18%,transparent)}
  .btn-mini{border:1px solid var(--line);background:var(--surface);color:var(--ink);font-weight:850;font-size:9.5px;letter-spacing:.04em;padding:8px 12px;border-radius:999px;white-space:nowrap;transition:.18s ease}.btn-mini:hover{background:var(--dark);border-color:var(--dark);color:#fff}
  .btn-mini .chev{display:inline-block;margin-left:5px;transition:transform .2s}.secao.dados-abertos .btn-dados .chev{transform:rotate(180deg)}
  .chip-filtro{display:inline-flex;align-items:center;gap:6px;background:var(--brand);color:#fff;font-size:10.5px;font-weight:800;border-radius:999px;padding:5px 10px;cursor:pointer}
  .secao.recolhida .secao-como-ler,.secao.recolhida .secao-body{display:none}.secao-toggle .chev{transition:transform .18s}.secao.recolhida .secao-toggle .chev{transform:rotate(-90deg)}
  .secao-como-ler{padding:13px 24px;background:var(--surface-2);border-bottom:1px solid var(--line);font-size:11.5px;line-height:1.65;color:var(--ink-2);display:flex;gap:10px;align-items:flex-start}
  .secao-como-ler .i{flex:0 0 23px;width:23px;height:23px;border-radius:7px;background:var(--pale);display:grid;place-items:center;font-family:Georgia,serif;font-size:11px;color:var(--brand);font-weight:700}
  .secao-body{padding:24px;display:grid;gap:20px;grid-template-columns:1fr}
  .secao:not(.dados-abertos) .tabela-wrap,.secao:not(.dados-abertos) .tabela-rodape{display:none}
  .v-shell{border-radius:24px;padding:26px;background:linear-gradient(180deg,var(--surface-2),var(--paper));box-shadow:inset 0 0 0 1px var(--line)}
  .v-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:22px}.v-head span.k{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.16em;font-weight:900;color:var(--brand);margin-bottom:5px}.v-head h4{font-size:19px;letter-spacing:-.035em}.v-head p{font-size:11.5px;line-height:1.65;color:var(--ink-2);max-width:690px;margin:5px 0 0}
  .v-stat{background:var(--dark);color:#fff;padding:12px 14px;border-radius:16px;min-width:130px;text-align:left}.v-stat b{font-family:var(--mono);font-size:17px;display:block}.v-stat small{display:block;font-size:8px;text-transform:uppercase;letter-spacing:.1em;color:rgba(255,255,255,.55);margin-top:2px}
  .v-linhas{display:grid;gap:9px}
  .v-linha{display:grid;grid-template-columns:minmax(180px,26%) 1fr 120px;align-items:center;gap:13px;padding:7px 10px;margin:0 -10px;border-radius:15px;cursor:pointer;transition:background .15s}.v-linha:hover{background:var(--surface-2)}.v-linha.ativa{background:var(--soft);outline:1px solid color-mix(in srgb,var(--brand) 40%,transparent)}
  .v-nome b{display:block;font-size:11.5px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.v-nome small{font-size:8.5px;color:var(--muted)}
  .v-track{height:26px;background:var(--surface-3);border-radius:999px;position:relative;overflow:hidden}
  .v-fill{height:100%;width:0;border-radius:999px;background:linear-gradient(90deg,var(--dark-2),var(--brand));min-width:4px;transition:width .9s cubic-bezier(.2,.8,.2,1);display:flex;align-items:center;justify-content:flex-end;padding-right:8px;color:#fff;font-family:var(--mono);font-size:9.5px;font-weight:800}.visivel .v-fill{width:var(--w)}
  .v-linha.critica .v-fill{background:linear-gradient(90deg,#b44b23,var(--gold))}.v-linha.critica{background:color-mix(in srgb,var(--gold) 12%,transparent)}
  .v-meta{text-align:right;font-family:var(--mono);font-size:10.5px;font-weight:800;color:var(--ink)}.v-meta small{display:block;font-family:var(--font);font-size:8.5px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-top:2px}
  .v-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
  .v-card{border:1px solid var(--line);border-radius:20px;padding:18px;background:var(--surface);position:relative;overflow:hidden}.v-card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--brand)}
  .v-card>span{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:850}.v-card .atual{font-size:24px;font-weight:800;letter-spacing:-.03em;margin:6px 0 12px;font-variant-numeric:tabular-nums}
  .v-card dl{margin:0;display:grid;grid-template-columns:1fr 1fr;gap:8px}.v-card dt{font-size:8px;color:var(--muted);text-transform:uppercase;letter-spacing:.07em}.v-card dd{margin:2px 0 0;font-family:var(--mono);font-size:11px;font-weight:800;color:var(--ink)}
  .v-tendencia svg{width:100%;height:auto;display:block}.v-tendencia .grade{stroke:var(--line-2);stroke-width:1;stroke-dasharray:3 4}.v-tendencia text{font-family:var(--font);font-size:11px;fill:var(--muted);font-weight:700}.v-tendencia .bar{fill:var(--surface-3)}.v-tendencia .bar.parcial{fill:var(--gold)}.v-tendencia .area{fill:url(#gradTend)}.v-tendencia .line{fill:none;stroke:var(--brand);stroke-width:3.5;stroke-linejoin:round;stroke-linecap:round}.v-tendencia .point{fill:var(--paper);stroke:var(--brand);stroke-width:3;cursor:pointer}.v-tendencia .point.parcial{stroke:var(--gold)}.v-tendencia .val{font-family:var(--mono);font-size:12px;fill:var(--brand-active);font-weight:800}
  .v-legenda{display:flex;flex-wrap:wrap;gap:16px;margin-top:10px;font-size:9.5px;color:var(--ink-2);font-weight:700}.v-legenda i{display:inline-block;width:14px;height:4px;border-radius:2px;background:var(--brand);margin-right:5px;vertical-align:middle}.v-legenda i.bar{background:var(--surface-3);height:10px;width:10px}.v-legenda i.parcial{background:var(--gold);height:10px;width:10px}
  .v-colunas{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:10px;align-items:end;min-height:220px}
  .v-col{display:flex;flex-direction:column;align-items:center;min-width:0;cursor:pointer}.v-col .val{font-family:var(--mono);font-size:10px;font-weight:800;margin-bottom:7px}
  .v-col-wrap{height:150px;width:100%;max-width:70px;display:flex;align-items:flex-end;background:var(--surface-3);border-radius:12px;overflow:hidden}.v-col-bar{width:100%;height:0;background:linear-gradient(180deg,var(--brand-2),#e44711);border-radius:12px 12px 6px 6px;transition:height .9s cubic-bezier(.2,.8,.2,1)}.visivel .v-col-bar{height:var(--h)}
  .v-col b{font-size:9px;margin-top:9px;color:var(--ink-2);text-align:center}.v-col small{font-size:8px;color:var(--muted);margin-top:2px;text-align:center}
  .grafico{display:none}
  .tabela-wrap{position:relative;overflow:auto;border:1px solid var(--line);border-radius:20px;max-height:640px;background:var(--surface)}
  table.tabela{width:100%;min-width:640px;border-collapse:separate;border-spacing:0;font-size:12.5px}
  table.tabela thead th{position:sticky;top:0;z-index:3;height:46px;background:var(--thead);color:var(--thead-ink);font-size:8.5px;text-transform:uppercase;letter-spacing:.13em;font-weight:900;text-align:left;padding:12px 14px;cursor:pointer;user-select:none;white-space:nowrap;transition:color .18s,background .18s}
  table.tabela thead th:hover{background:#2a1a14;color:#fff}table.tabela th::after{content:"↕";margin-left:6px;font-size:9px;opacity:0;transition:opacity .18s}table.tabela th:hover::after{opacity:.55}table.tabela th[data-ordem]::after{opacity:1;color:var(--brand)}table.tabela th[data-ordem="asc"]::after{content:"↑"}table.tabela th[data-ordem="desc"]::after{content:"↓"}
  table.tabela th.col-num{text-align:right}
  table.tabela td{height:49px;padding:11px 14px;border-bottom:1px solid var(--line);vertical-align:middle;color:var(--ink);background:var(--surface);transition:background .15s;cursor:pointer}
  table.tabela tbody tr:nth-child(even) td{background:var(--surface-2)}table.tabela tbody tr:hover td{background:var(--pale)!important}table.tabela tbody tr:last-child td{border-bottom:none}table.tabela tr[hidden]{display:none}
  table.tabela .col-rotulo{position:sticky;left:0;z-index:2;font-weight:750;white-space:nowrap;box-shadow:1px 0 0 var(--line)}table.tabela thead .col-rotulo{z-index:4;background:var(--thead)}table.tabela tbody tr:hover .col-rotulo{box-shadow:inset 3px 0 0 var(--brand),1px 0 0 var(--line)}
  table.tabela td.num,table.tabela td.col-num{text-align:right;font-family:var(--mono);font-variant-numeric:tabular-nums;white-space:nowrap;letter-spacing:-.015em}table.tabela td.col-num:not(.num){color:var(--muted)}
  table.tabela td.pct{position:relative;padding-bottom:13px;font-weight:800;color:var(--brand-active)}table.tabela td.pct::before{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;background:var(--surface-3)}table.tabela td.pct::after{content:"";position:absolute;left:0;bottom:0;height:2px;width:var(--pct,0%);background:linear-gradient(90deg,var(--brand),var(--brand-2))}
  table.tabela td.delta{font-family:var(--mono);font-weight:700;text-align:right;white-space:nowrap}table.tabela td.delta.sobe::after{content:" ▲";font-size:8px;opacity:.6}table.tabela td.delta.desce::after{content:" ▼";font-size:8px;opacity:.6}
  .tabela-rodape{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:10px;font-size:10px;color:var(--muted);flex-wrap:wrap}
  .amostra{display:inline-block;margin-left:8px;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:2px 7px;border-radius:999px;background:color-mix(in srgb,var(--gold) 20%,var(--surface));color:#a66b00}

  .glossario{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}
  .glossario-item{background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:17px 18px;transition:border-color .2s,transform .2s}.glossario-item:hover{border-color:color-mix(in srgb,var(--brand) 40%,var(--line));transform:translateY(-2px)}
  .glossario-item dt{font-size:11px;font-weight:900;color:var(--brand-active);margin:0 0 4px}.glossario-item dd{margin:0;font-size:11px;line-height:1.65;color:var(--ink-2)}
  .notas{margin:14px 0 0;padding-left:20px;font-size:12px;line-height:1.65;color:var(--ink-2)}.notas li{margin-bottom:6px}.notas li::marker{color:var(--brand)}

  .voltar-topo{position:fixed;right:16px;bottom:66px;width:44px;height:44px;border-radius:50%;background:radial-gradient(circle at 32% 28%,var(--brand-2),var(--brand-active) 85%);color:#fff;border:none;font-size:18px;box-shadow:0 14px 30px -12px var(--soft-glow);opacity:0;transform:translateY(10px);transition:opacity .2s,transform .2s;z-index:30}.voltar-topo.visivel{opacity:1;transform:none}
  .theme-toggle{position:fixed;bottom:14px;right:14px;display:flex;gap:6px;background:color-mix(in srgb,var(--surface) 88%,transparent);backdrop-filter:blur(12px);border:1px solid var(--line);border-radius:999px;padding:4px;box-shadow:var(--shadow);z-index:50}
  .theme-toggle button{border:none;background:none;padding:6px 11px;border-radius:999px;font-size:11px;font-weight:800;color:var(--ink-2);transition:background .18s,color .18s}.theme-toggle button.active{background:var(--brand);color:#fff}
  footer{max-width:var(--maxw);margin:36px auto 0;padding:22px 34px 0;border-top:1px solid var(--line);text-align:center;font-size:11px;color:var(--muted)}
  .footer-brand{display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:6px}.footer-brand svg{height:15px;width:auto}.footer-brand span{font-weight:900;color:var(--ink);letter-spacing:.04em}

  @media (max-width:1120px){.hero-inner{grid-template-columns:1fr;gap:42px}.hero{min-height:auto}.placar{max-width:780px}.bento{grid-template-columns:1fr 1fr}.tile-escuro{grid-row:auto;grid-column:1/3;min-height:280px}.comando-topo{align-items:flex-start;flex-direction:column}.capitulo{margin-left:0;margin-right:0}.letterhead-tagline,.letterhead-divider{display:none}}
  @media (max-width:720px){.wrap,.letterhead-inner,.sumario-inner{padding-left:16px;padding-right:16px}.hero{padding:48px 16px 82px}.hero h1{font-size:40px}.placar{grid-template-columns:1fr}.placar-principal{min-height:auto}.placar-minis{grid-template-columns:1fr 1fr}.comando{margin-top:-42px}.bento{grid-template-columns:1fr}.tile-escuro{grid-column:auto;min-height:280px}.comando-topo h2{font-size:28px}.capitulo{padding:27px 20px;display:block}.capitulo p{margin-top:14px}.capitulo h2{font-size:26px}.v-linha{grid-template-columns:1fr}.v-meta{text-align:left}.secao{border-radius:22px}.secao-head,.secao-body{padding:17px}.v-shell{padding:18px;border-radius:18px}.secao-tools{width:100%}.filtro-input{display:none}.v-head{display:block}.v-stat{display:inline-block;margin-top:12px}}
  @media (prefers-reduced-motion:reduce){.anima{opacity:1;transform:none;transition:none}.v-fill,.v-col-bar{transition:none}.v-fill{width:var(--w)}.v-col-bar{height:var(--h)}.fase{transform:none}.orbe .arco{transition:none}}
  @media print{
    :root{--bg:#fff;--bg-top:#fff;--paper:#fff;--surface:#fff;--surface-2:#f5f1ee;--surface-3:#ece6e1;--ink:#171210;--ink-2:#4a423e;--line:rgba(0,0,0,.15)}
    body{background:#fff;padding:0}#bg3d,.sumario,.voltar-topo,.theme-toggle,.btn-imprimir,.secao-tools,.tabela-rodape,.filtro-input,.btn-gaveta,.ck-ir,.foco-limpar{display:none!important}
    .anima{opacity:1;transform:none}.v-fill{width:var(--w)}.v-col-bar{height:var(--h)}.gaveta-kpis{display:block}
    .secao,.painel,.kpi,.ia-insights-card,.tile,.ck-card{box-shadow:none;break-inside:avoid}.secao.recolhida .secao-body,.secao.recolhida .secao-como-ler{display:grid}
    .secao .tabela-wrap,.secao .tabela-rodape{display:block!important}.tabela-wrap{max-height:none;overflow:visible}table.tabela tr[hidden]{display:table-row}
    .hero,.capitulo.escuro,.tile-escuro,.tile-laranja,.ck-orbe{-webkit-print-color-adjust:exact;print-color-adjust:exact}.hero{min-height:auto;padding:36px 20px}.comando{margin:20px 0}.bento{grid-template-columns:repeat(3,1fr)}.fase{transform:none}
  }
  `;
}

function relatorioVisualJs() {
  return String.raw`
  (function(){
    var reduz=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var parseNumero=${relatorioVisualParseNumero.toString()};
    function fmtN(v,d){return v==null?'—':Number(v).toLocaleString('pt-BR',{minimumFractionDigits:d||0,maximumFractionDigits:d||0});}

    /* tema claro / escuro / sistema */
    var root=document.documentElement;
    function setTheme(c){
      if(c==='system')root.removeAttribute('data-theme');else root.setAttribute('data-theme',c);
      document.querySelectorAll('.theme-toggle button').forEach(function(b){b.classList.toggle('active',b.getAttribute('data-theme-choice')===c);});
      try{localStorage.setItem('atlas-relatorio-theme',c);}catch(e){}
    }
    document.querySelectorAll('.theme-toggle button').forEach(function(b){b.addEventListener('click',function(){setTheme(b.getAttribute('data-theme-choice'));});});
    try{var sv=localStorage.getItem('atlas-relatorio-theme');if(sv)setTheme(sv);}catch(e){}

    /* entrada animada com fallback: sem IntersectionObserver tudo fica visível */
    var animados=document.querySelectorAll('.anima');
    if('IntersectionObserver' in window&&!reduz){
      root.classList.add('anima-on');
      var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('visivel');io.unobserve(e.target);}});},{threshold:.08});
      animados.forEach(function(el){io.observe(el);});
      setTimeout(function(){animados.forEach(function(el){el.classList.add('visivel');});},2500);
    }else{animados.forEach(function(el){el.classList.add('visivel');});}

    /* contagem animada nos KPIs e no placar */
    document.querySelectorAll('[data-numero]').forEach(function(el){
      var alvo=parseFloat(el.getAttribute('data-numero'));var textoFinal=el.textContent;
      if(!isFinite(alvo)||reduz)return;
      var prefixo=el.getAttribute('data-prefixo')||'',sufixo=el.getAttribute('data-sufixo')||'';
      var dec=parseInt(el.getAttribute('data-decimais')||'0',10),milhar=el.getAttribute('data-milhar')==='1';
      var ini=null,dur=1100;
      function fmt(v){return prefixo+(milhar?v.toLocaleString('pt-BR',{minimumFractionDigits:dec,maximumFractionDigits:dec}):v.toFixed(dec))+sufixo;}
      function passo(ts){if(ini===null)ini=ts;var p=Math.min(1,(ts-ini)/dur);var e=1-Math.pow(1-p,3);el.textContent=fmt(alvo*e);if(p<1)requestAnimationFrame(passo);else el.textContent=textoFinal;}
      requestAnimationFrame(passo);
    });

    /* KPI: clique copia; tilt 3D no hover */
    document.querySelectorAll('.kpi').forEach(function(card){
      card.addEventListener('click',function(){
        var texto=(card.querySelector('.kpi-rotulo')||{}).textContent+': '+(card.querySelector('.kpi-valor')||{}).textContent;
        var ok=function(){card.classList.add('copiado');clearTimeout(card._t);card._t=setTimeout(function(){card.classList.remove('copiado');},1500);};
        if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(texto).then(ok,ok);}else{ok();}
      });
      if(reduz)return;
      card.addEventListener('mousemove',function(e){var r=card.getBoundingClientRect();var x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;card.style.transform='perspective(900px) rotateY('+(x*8).toFixed(2)+'deg) rotateX('+(-y*8).toFixed(2)+'deg) translateY(-4px)';});
      card.addEventListener('mouseleave',function(){card.style.transform='';});
    });

    /* gaveta dos indicadores complementares */
    var btnGaveta=document.querySelector('.btn-gaveta'),gaveta=document.querySelector('.gaveta-kpis');
    if(btnGaveta&&gaveta){btnGaveta.addEventListener('click',function(){var on=gaveta.classList.toggle('aberta');btnGaveta.textContent=on?'Ocultar indicadores complementares −':btnGaveta.getAttribute('data-rotulo-fechado');});}

    /* orbe: anima o arco até o valor */
    document.querySelectorAll('.orbe .arco').forEach(function(arco){
      var C=2*Math.PI*60,p=Math.max(0,Math.min(1,parseFloat(arco.getAttribute('data-pct')||'0')/100));
      arco.setAttribute('stroke-dasharray',C.toFixed(1));arco.setAttribute('stroke-dashoffset',C.toFixed(1));
      setTimeout(function(){arco.setAttribute('stroke-dashoffset',(C*(1-p)).toFixed(1));},260);
    });

    /* sparkline: tooltip */
    document.querySelectorAll('.spark').forEach(function(box){
      var tip=box.querySelector('.spark-tip');
      box.querySelectorAll('.pt').forEach(function(c){
        c.addEventListener('mouseenter',function(){var r=box.getBoundingClientRect(),cr=c.getBoundingClientRect();tip.textContent=c.getAttribute('data-tip')||'';tip.style.left=(cr.left-r.left+cr.width/2)+'px';tip.style.top=(cr.top-r.top)+'px';tip.classList.add('on');});
        c.addEventListener('mouseleave',function(){tip.classList.remove('on');});
      });
    });

    /* tabelas: filtro, ordenação, limite, classes de coluna */
    function aplicarFiltros(secao){
      var table=secao.querySelector('table.tabela');if(!table)return;
      var campo=secao.querySelector('.filtro-input');var termo=campo?campo.value.trim().toLowerCase():'';
      var barra=secao.getAttribute('data-filtro-barra')||'';
      var todas=secao.classList.contains('mostrar-todas');
      var limite=parseInt(secao.getAttribute('data-limite')||'12',10);
      var visiveis=0,total=0;
      Array.prototype.forEach.call(table.tBodies[0].rows,function(tr){
        var ok=(!termo||tr.textContent.toLowerCase().indexOf(termo)>-1)&&(!barra||tr.getAttribute('data-rotulo')===barra);
        if(ok){total++;var mostrar=todas||visiveis<limite;tr.hidden=!mostrar;if(mostrar)visiveis++;}else{tr.hidden=true;}
      });
      var cont=secao.querySelector('.contagem');if(cont)cont.textContent=(visiveis===total?total:visiveis+' de '+total)+(total===1?' registro':' registros');
      var btn=secao.querySelector('.btn-todas');if(btn){btn.hidden=todas||total<=limite;btn.textContent='Mostrar todas ('+total+')';}
      var chip=secao.querySelector('.chip-filtro');if(chip){chip.hidden=!barra;var sp=chip.querySelector('span');if(sp)sp.textContent=barra;}
      secao.querySelectorAll('[data-rotulo].v-linha,[data-rotulo].v-col').forEach(function(b){b.classList.toggle('ativa',!!barra&&b.getAttribute('data-rotulo')===barra);});
    }
    function marcarColunas(table){
      if(!table.tHead||!table.tBodies[0])return;
      var head=table.tHead.rows[0],linhas=Array.prototype.slice.call(table.tBodies[0].rows);
      linhas.forEach(function(tr){Array.prototype.forEach.call(tr.cells,function(td){
        var t=td.textContent.trim();var n=parseNumero(t);
        if(n!==null)td.classList.add('num');
        if(/^-?\d+(\.\d+)?%$/.test(t)){td.classList.add('pct');td.style.setProperty('--pct',Math.max(0,Math.min(100,n))+'%');}
      });});
      Array.prototype.forEach.call(head.cells,function(th,i){
        if(i===0){th.classList.add('col-rotulo');linhas.forEach(function(tr){if(tr.cells[i])tr.cells[i].classList.add('col-rotulo');});return;}
        var vistos=0,nums=0;
        linhas.forEach(function(tr){var td=tr.cells[i];if(!td)return;var txt=td.textContent.trim();if(!txt||txt==='—'||txt==='-')return;vistos++;if(td.classList.contains('num'))nums++;});
        if(vistos&&nums/vistos>=.6){th.classList.add('col-num');linhas.forEach(function(tr){if(tr.cells[i])tr.cells[i].classList.add('col-num');});}
        if(/^Δ/.test(th.textContent.trim())){linhas.forEach(function(tr){var td=tr.cells[i];if(!td)return;var txt=td.textContent.trim();td.classList.add('delta');if(txt.charAt(0)==='+')td.classList.add('sobe');else if(txt.charAt(0)==='-')td.classList.add('desce');});}
      });
    }
    document.querySelectorAll('.secao').forEach(function(secao){
      var table=secao.querySelector('table.tabela');
      if(table){
        marcarColunas(table);
        Array.prototype.forEach.call(table.tHead.rows[0].cells,function(th,idx){
          th.title='Clique para ordenar';
          th.addEventListener('click',function(){
            var asc=th.getAttribute('data-ordem')!=='asc';
            Array.prototype.forEach.call(table.tHead.rows[0].cells,function(o){o.removeAttribute('data-ordem');});
            th.setAttribute('data-ordem',asc?'asc':'desc');
            var tbody=table.tBodies[0],linhas=Array.prototype.slice.call(tbody.rows);
            linhas.sort(function(a,b){
              var ta=a.cells[idx]?a.cells[idx].textContent.trim():'',tb=b.cells[idx]?b.cells[idx].textContent.trim():'';
              var na=parseNumero(ta),nb=parseNumero(tb),r;
              if(na!==null&&nb!==null)r=na-nb;else if(na!==null)r=-1;else if(nb!==null)r=1;else r=ta.localeCompare(tb,'pt-BR');
              return asc?r:-r;
            });
            linhas.forEach(function(l){tbody.appendChild(l);});
            aplicarFiltros(secao);
          });
        });
      }
      var campo=secao.querySelector('.filtro-input');if(campo)campo.addEventListener('input',function(){secao.classList.remove('mostrar-todas');secao.classList.add('dados-abertos');aplicarFiltros(secao);});
      var btn=secao.querySelector('.btn-todas');if(btn)btn.addEventListener('click',function(){secao.classList.add('mostrar-todas');aplicarFiltros(secao);});
      var chip=secao.querySelector('.chip-filtro');if(chip)chip.addEventListener('click',function(){secao.removeAttribute('data-filtro-barra');aplicarFiltros(secao);});
      var dados=secao.querySelector('.btn-dados');if(dados)dados.addEventListener('click',function(){var on=secao.classList.toggle('dados-abertos');dados.innerHTML=(on?'Ocultar dados':'Ver dados')+' <span class="chev">⌄</span>';});
      secao.querySelectorAll('[data-rotulo].v-linha,[data-rotulo].v-col').forEach(function(b){
        b.addEventListener('click',function(){
          var r=b.getAttribute('data-rotulo');
          if(secao.getAttribute('data-filtro-barra')===r)secao.removeAttribute('data-filtro-barra');else secao.setAttribute('data-filtro-barra',r);
          secao.classList.remove('mostrar-todas');secao.classList.add('dados-abertos');aplicarFiltros(secao);
          foco(r);
        });
      });
      var toggle=secao.querySelector('.secao-toggle');if(toggle)toggle.addEventListener('click',function(){secao.classList.toggle('recolhida');toggle.setAttribute('aria-expanded',secao.classList.contains('recolhida')?'false':'true');});
      aplicarFiltros(secao);
    });

    /* foco conectado: um rótulo, todas as seções */
    var focoAtual=null;
    function lerTabelas(){
      var out=[];
      document.querySelectorAll('.secao').forEach(function(sec){
        var t=sec.querySelector('table.tabela');if(!t||!t.tHead||!t.tBodies[0])return;
        var cols=Array.prototype.map.call(t.tHead.rows[0].cells,function(c){return c.textContent.trim();});
        var rows=Array.prototype.map.call(t.tBodies[0].rows,function(tr){var o={_rotulo:(tr.getAttribute('data-rotulo')||(tr.cells[0]?tr.cells[0].textContent.trim():'')),_tr:tr};Array.prototype.forEach.call(tr.cells,function(td,i){o[cols[i]]=td.textContent.trim();});return o;});
        var h=sec.querySelector('.secao-titulo');
        out.push({cols:cols,rows:rows,sec:sec,titulo:h?h.textContent.trim():sec.id});
      });
      return out;
    }
    var TABS=lerTabelas();
    var corpo=document.getElementById('focoCorpo'),limparBtn=document.getElementById('focoLimpar');
    var textoVazio=corpo?corpo.innerHTML:'';
    function foco(rotulo){
      if(!corpo)return;
      rotulo=String(rotulo||'').trim();if(!rotulo)return;
      if(focoAtual&&focoAtual.toLowerCase()===rotulo.toLowerCase()){limpar();return;}
      focoAtual=rotulo;var alvoL=rotulo.toLowerCase();
      document.querySelectorAll('.linha-foco').forEach(function(e){e.classList.remove('linha-foco');});
      var blocos=[];
      TABS.forEach(function(t){t.rows.forEach(function(r){
        if(String(r._rotulo).toLowerCase()!==alvoL)return;
        r._tr.classList.add('linha-foco');
        var dl=t.cols.slice(1).map(function(c){return '<dt>'+c+'</dt><dd>'+(r[c]||'—')+'</dd>';}).join('');
        blocos.push('<div class="foco-bloco"><span class="origem">'+t.titulo+'</span><dl>'+dl+'</dl></div>');
      });});
      document.querySelectorAll('[data-rotulo]').forEach(function(b){if(!b.classList.contains('v-linha')&&!b.classList.contains('v-col')&&b.tagName!=='TR')return;if(String(b.getAttribute('data-rotulo')).toLowerCase()===alvoL)b.classList.add('linha-foco');});
      var nome=document.createElement('span');nome.className='foco-nome';nome.textContent=rotulo;
      corpo.innerHTML='';
      var topo=document.createElement('div');topo.className='foco-topo';topo.appendChild(nome);
      var qtd=document.createElement('span');qtd.className='mix-item';qtd.innerHTML='aparece em <b>'+blocos.length+'</b> '+(blocos.length===1?'seção':'seções');topo.appendChild(qtd);
      corpo.appendChild(topo);
      if(blocos.length){var g=document.createElement('div');g.className='foco-grid';g.innerHTML=blocos.join('');corpo.appendChild(g);}
      else{var p=document.createElement('p');p.className='foco-vazio';p.textContent='Este item não aparece nas tabelas das outras seções deste relatório.';corpo.appendChild(p);}
      if(limparBtn)limparBtn.hidden=false;
    }
    function limpar(){focoAtual=null;document.querySelectorAll('.linha-foco').forEach(function(e){e.classList.remove('linha-foco');});if(corpo)corpo.innerHTML=textoVazio;if(limparBtn)limparBtn.hidden=true;}
    if(limparBtn)limparBtn.addEventListener('click',limpar);
    document.querySelectorAll('table.tabela tbody').forEach(function(tb){tb.addEventListener('click',function(e){var tr=e.target.closest('tr');if(!tr||!tr.cells.length)return;foco(tr.getAttribute('data-rotulo')||tr.cells[0].textContent.trim());});});
    document.querySelectorAll('.fase[data-rotulo],.mix-seg[data-rotulo],.spark .pt[data-rotulo]').forEach(function(b){b.addEventListener('click',function(){foco(b.getAttribute('data-rotulo'));});});
    document.querySelectorAll('.ck-ir[data-ir]').forEach(function(b){b.addEventListener('click',function(){var el=document.getElementById(b.getAttribute('data-ir'));if(el)el.scrollIntoView({behavior:reduz?'auto':'smooth',block:'start'});});});

    /* sumário ativo, voltar ao topo, imprimir */
    var links=Array.prototype.slice.call(document.querySelectorAll('.sumario a'));
    var alvos=links.map(function(a){return document.querySelector(a.getAttribute('href'));}).filter(Boolean);
    function marcarAtivo(){
      var y=window.scrollY+100,atual=alvos[0];
      alvos.forEach(function(el){if(el.offsetTop<=y)atual=el;});
      links.forEach(function(a){a.classList.toggle('ativo',!!atual&&a.getAttribute('href')==='#'+atual.id);});
      var topo=document.querySelector('.voltar-topo');if(topo)topo.classList.toggle('visivel',window.scrollY>400);
    }
    window.addEventListener('scroll',marcarAtivo,{passive:true});marcarAtivo();
    var topo=document.querySelector('.voltar-topo');if(topo)topo.addEventListener('click',function(){window.scrollTo({top:0,behavior:reduz?'auto':'smooth'});});
    var imprimir=document.querySelector('.btn-imprimir');if(imprimir)imprimir.addEventListener('click',function(){window.print();});

    /* fundo 3D ambiental: poliedros em wireframe (canvas 2D, sem biblioteca) */
    if(!reduz&&window.innerWidth>640){
      var cv=document.createElement('canvas');cv.id='bg3d';cv.setAttribute('aria-hidden','true');document.body.insertBefore(cv,document.body.firstChild);
      var ctx=cv.getContext&&cv.getContext('2d');
      if(ctx){
        var W=0,H=0,DPR=Math.min(window.devicePixelRatio||1,2);
        function medir(){W=window.innerWidth;H=window.innerHeight;cv.width=W*DPR;cv.height=H*DPR;cv.style.width=W+'px';cv.style.height=H+'px';ctx.setTransform(DPR,0,0,DPR,0,0);}
        medir();window.addEventListener('resize',medir);
        function icosaedro(){var t=(1+Math.sqrt(5))/2;var v=[[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]];var r=Math.sqrt(1+t*t);v=v.map(function(p){return [p[0]/r,p[1]/r,p[2]/r];});var e=[],lim=2/r+1e-6;for(var i=0;i<v.length;i++)for(var j=i+1;j<v.length;j++){var d=Math.sqrt(Math.pow(v[i][0]-v[j][0],2)+Math.pow(v[i][1]-v[j][1],2)+Math.pow(v[i][2]-v[j][2],2));if(d<lim)e.push([i,j]);}return {v:v,e:e};}
        function octaedro(){var v=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]],e=[];for(var i=0;i<6;i++)for(var j=i+1;j<6;j++){if(Math.floor(i/2)!==Math.floor(j/2))e.push([i,j]);}return {v:v,e:e};}
        var MALHAS=[icosaedro(),octaedro()],CICLO=0,corpos=[];
        function popular(){corpos=[];CICLO=H+700;var n=window.innerWidth<760?4:8;for(var i=0;i<n;i++){corpos.push({malha:MALHAS[i%2],s:34+Math.random()*76,x:(i%2?1:-1)*(W*.34+Math.random()*W*.2),y:Math.random()*CICLO,z:(Math.random()-.5)*420,ax:Math.random()*6.28,ay:Math.random()*6.28,az:Math.random()*6.28,vx:(Math.random()-.5)*.0045,vy:(Math.random()-.5)*.0045,vz:(Math.random()-.5)*.003,quente:i%3===0});}}
        popular();window.addEventListener('resize',popular);
        var sy=0;window.addEventListener('scroll',function(){sy=window.pageYOffset||0;},{passive:true});
        var FOCO=560;
        function desenhar(){
          ctx.clearRect(0,0,W,H);var oy=-sy*.06;
          for(var c=0;c<corpos.length;c++){
            var o=corpos[c];o.ax+=o.vx;o.ay+=o.vy;o.az+=o.vz;
            var yy=((o.y+oy)%CICLO+CICLO)%CICLO-350;
            var cax=Math.cos(o.ax),sax=Math.sin(o.ax),cay=Math.cos(o.ay),say=Math.sin(o.ay),caz=Math.cos(o.az),saz=Math.sin(o.az);
            var pts=[],v=o.malha.v;
            for(var i=0;i<v.length;i++){var x=v[i][0],y=v[i][1],z=v[i][2];var y1=y*cax-z*sax,z1=y*sax+z*cax;var x2=x*cay+z1*say,z2=-x*say+z1*cay;var x3=x2*caz-y1*saz,y3=x2*saz+y1*caz;var wz=z2*o.s+o.z;var f=FOCO/(FOCO+wz+260);pts.push([W/2+(x3*o.s+o.x)*f,yy+(y3*o.s)*f,f]);}
            var e=o.malha.e;ctx.lineWidth=o.quente?1.15:.85;
            for(var k=0;k<e.length;k++){var a=pts[e[k][0]],b=pts[e[k][1]];var prof=(a[2]+b[2])/2;var al=Math.max(0,Math.min(.5,(prof-.55)*1.5));if(al<=.01)continue;ctx.strokeStyle=o.quente?'rgba(255,86,24,'+al.toFixed(3)+')':'rgba(255,157,112,'+(al*.62).toFixed(3)+')';ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();}
          }
        }
        (function loop(){if(!document.hidden)desenhar();requestAnimationFrame(loop);})();
      }
    }
  })();
  `;
}
