// 薬機レーダー（トップ）の見た目。親サイト med-ad-masa.com の編集誌型と同じ決まりで組む。
//
// 決まり
// - 地は生成り、文字は墨。塗りの面は記入欄の用紙と、色で意味を持たせる帯（判定・注意・エラー）だけ。
// - 見出しは明朝・薬瓶グリーン。小ラベルと数字（件数・料金・文字数）は等幅で桁をそろえる。
// - 朱は句読点・番号・必須の印・フォーカスの枠だけ。面には塗らない。
// - 区切りは1pxの罫線と余白。角丸と影は使わない。
// - リスク区分の色の意味（赤＝修正必須/HIGH、琥珀＝要修正/MEDIUM、青＝軽微修正/LOW、緑＝問題なし）は保つ。
//
// すべて .rd の内側だけに効かせる。styles/globals.css は触らないので、ほかのページの見た目は変わらない。
// body の地色と main の幅だけは、このスタイルが載っている間（トップを開いている間）に限って上書きする。

// 書体の読み込み先（pages/index.js の <Head> で使う）
export const RADAR_FONT_HREF =
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Shippori+Mincho:wght@600;700&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap";

const ARW =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='9' viewBox='0 0 28 9'%3E%3Cpath d='M0 4.5h27M23 .5l4 4-4 4' fill='none' stroke='%23000' stroke-width='1'/%3E%3C/svg%3E\")";

export const RADAR_CSS = `
body { background:#f6f3ea; }
main.rd-main { max-width:none; padding:0; min-height:0; }

.rd { --ink:#1d2b27; --ink2:#3f4d48; --ink3:#56635e;
  --paper:#f6f3ea; --paper2:#efebdf; --sheet:#fbfaf5; --cream:#f3f1e9;
  --vial:#0f5b4e; --vial-deep:#0a3f36; --vial-bright:#8fd0c0; --signal:#c33f19; --amber-l:#ebc577;
  --line:#cfcabb; --line2:#b9b3a1;
  --danger:#a3261a; --danger-bg:#f7e6df; --danger-bd:#d9a394;
  --warn:#7d5200; --warn-bg:#f6ecd0; --warn-bd:#d6b96a;
  --info:#1f4f8f; --info-bg:#e3eaf1; --info-bd:#9db4cf;
  --ok:#0f5b4e; --ok-bg:#e3efe8; --ok-bd:#9cc5b6;
  --acc:#0f5b4e; --acc-bg:#eaf0e8; --acc-bd:#9cc5b6;
  --serif:"Shippori Mincho","Noto Serif JP","Hiragino Mincho ProN","Yu Mincho",serif;
  --jp:"Zen Kaku Gothic New","Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic",Meiryo,sans-serif;
  --mono:"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace;
  --side:clamp(16px,5.5vw,80px); --ease:cubic-bezier(.2,.7,.2,1);
  color:var(--ink); font-family:var(--jp); font-size:15px; line-height:1.9; letter-spacing:.02em;
  word-break:auto-phrase; line-break:strict; }
.rd *, .rd *::before, .rd *::after { box-sizing:border-box; border-radius:0; }
.rd p, .rd h1, .rd dl, .rd dd { margin:0; }
.rd a { color:inherit; }
.rd a:hover { opacity:1; }
.rd button { background:none; border:0; color:inherit; font-family:inherit; letter-spacing:inherit; cursor:pointer; padding:0; transition:none; }
.rd button:hover:not(:disabled) { opacity:1; }
.rd :focus-visible { outline:2px solid var(--signal); outline-offset:3px; }
.rd .wrap { max-width:calc(1280px + var(--side)*2); margin:0 auto; padding:0 var(--side); }
.rd .mono { font-family:var(--mono); font-size:11.5px; letter-spacing:.14em; text-transform:uppercase; font-variant-numeric:tabular-nums; line-height:1.6; }
.rd .num { font-family:var(--mono); font-variant-numeric:tabular-nums; letter-spacing:.02em; }
.rd .nb { display:inline-block; }
.rd .sig { color:var(--signal); }
.rd .arw { display:inline-block; width:28px; height:9px; flex:none; background:currentColor;
  -webkit-mask:${ARW} center/contain no-repeat; mask:${ARW} center/contain no-repeat; transition:transform .35s var(--ease); }
.rd a:hover > .arw, .rd button:not(:disabled):hover > .arw { transform:translateX(5px); }

/* ---------- ナビ ---------- */
.rd .nav { position:sticky; top:0; z-index:50; background:var(--paper); border-bottom:1px solid var(--line); }
.rd .nav .wrap { display:flex; align-items:center; justify-content:space-between; height:72px; gap:20px; }
.rd .brand { display:flex; align-items:center; min-width:0; }
.rd .logo { display:inline-flex; align-items:center; text-decoration:none; font-family:var(--serif); font-weight:700; font-size:19px;
  letter-spacing:.01em; color:var(--ink); min-height:44px; white-space:nowrap; }
.rd .logo svg { width:26px; height:26px; flex:none; margin-right:12px; }
.rd .logo .ad { color:var(--signal); }
.rd .logo .lab { color:var(--vial); margin-left:.3em; }
.rd .tool { display:inline-flex; align-items:center; min-height:44px; margin-left:18px; padding-left:18px; border-left:1px solid var(--line2);
  font-family:var(--serif); font-weight:600; font-size:16px; letter-spacing:.08em; color:var(--vial); text-decoration:none; white-space:nowrap; }
.rd .navlinks { display:flex; align-items:center; gap:32px; }
.rd .navlink { font-size:14px; font-weight:500; text-decoration:none; padding:12px 0; position:relative; letter-spacing:.04em; white-space:nowrap; }
.rd .navlink::after { content:""; position:absolute; left:0; right:0; bottom:8px; height:1px; background:var(--signal);
  transform:scaleX(0); transform-origin:left; transition:transform .35s var(--ease); }
.rd .navlink:hover::after { transform:scaleX(1); }

/* ---------- ボタン ---------- */
.rd .btn { display:inline-flex; align-items:center; justify-content:center; gap:14px; min-height:48px; padding:8px 28px;
  font-family:var(--jp); font-weight:700; font-size:15px; letter-spacing:.08em; line-height:1.5; text-align:center; text-decoration:none;
  border:1px solid var(--vial); transition:background .3s, color .3s, border-color .3s; }
.rd .btn-fill { background:var(--vial); color:var(--cream); }
.rd .btn-fill:hover:not(:disabled) { background:var(--vial-deep); border-color:var(--vial-deep); }
.rd .btn-rule { color:var(--vial); background:transparent; }
.rd .btn-rule:hover:not(:disabled) { background:var(--vial); color:var(--cream); }
.rd .btn-sm { min-height:44px; padding:6px 20px; font-size:13.5px; letter-spacing:.05em; }
.rd .btn-line { background:#06C755; border-color:#06C755; color:#fff; }
.rd .btn:disabled { background:transparent; color:var(--ink3); border-color:var(--line2); cursor:not-allowed; }
.rd .link-btn { display:inline-flex; align-items:center; min-height:44px; font-size:13.5px; font-weight:700; color:var(--vial);
  text-decoration:underline; text-underline-offset:5px; text-decoration-thickness:1px; flex:none; }
.rd .link-btn:hover { color:var(--signal); }
.rd .link-btn.muted { font-size:12.5px; font-weight:400; color:var(--ink3); }
.rd .more { display:inline-flex; align-items:center; gap:12px; min-height:44px; font-size:13.5px; font-weight:700; color:var(--vial);
  text-decoration:none; letter-spacing:.06em; border-bottom:1px solid var(--vial); transition:color .3s, border-color .3s; }
.rd .more:hover { color:var(--signal); border-color:var(--signal); }
.rd .acts { display:flex; flex-wrap:wrap; gap:8px 12px; align-items:center; margin-top:14px; }
.rd .acts .more { margin-left:8px; }

/* ---------- 第一面 ---------- */
.rd .top { padding-top:28px; padding-bottom:48px; }
.rd .mast { display:flex; justify-content:space-between; gap:16px; padding-bottom:14px; border-bottom:1px solid var(--vial); color:var(--vial); }
.rd .mast span:nth-child(2) { color:var(--ink3); }
.rd .first { display:grid; grid-template-columns:5fr 7fr; gap:clamp(40px,5vw,88px); padding-top:clamp(32px,4.4vw,64px); align-items:start; }
.rd .intro { position:sticky; top:104px; }
.rd .intro .kicker { color:var(--vial); margin-bottom:22px; }
.rd .intro h1 { font-family:var(--serif); font-weight:600; color:var(--vial); font-feature-settings:"palt";
  font-size:clamp(40px,5.2vw,76px); line-height:1.25; letter-spacing:.04em; white-space:nowrap; }
.rd .intro .tag { margin-top:18px; font-family:var(--serif); font-weight:600; font-size:clamp(15px,1.3vw,18px); color:var(--ink);
  letter-spacing:.06em; font-feature-settings:"palt"; }
.rd .intro .tag i { font-style:normal; color:var(--signal); margin:0 .1em; }
.rd .intro .lead { margin-top:28px; font-size:16px; color:var(--ink2); max-width:30em; }
.rd .facts { margin-top:36px; border-top:1px solid var(--line); }
.rd .facts div { display:grid; grid-template-columns:7.5em 1fr; gap:16px; padding:13px 0; border-bottom:1px solid var(--line); align-items:baseline; }
.rd .facts dt { font-size:13px; color:var(--ink3); letter-spacing:.06em; }
.rd .facts dd { font-size:14.5px; color:var(--ink); }
.rd .facts dd .num { font-size:17px; font-weight:500; color:var(--vial); margin:0 .12em; }
.rd .col { min-width:0; display:flex; flex-direction:column; gap:20px; }
.rd .sign { margin-top:56px; padding-top:18px; border-top:1px solid var(--line); font-size:12.5px; color:var(--ink3); line-height:1.8; text-align:center; }

/* ---------- 記入欄 ---------- */
.rd .form { border:1px solid var(--vial); background:var(--sheet); }
.rd .form-head { display:flex; justify-content:space-between; align-items:center; gap:12px; min-height:46px; padding:0 24px;
  border-bottom:1px solid var(--vial); color:var(--vial); }
.rd .form-head .quota { color:var(--ink2); font-size:12.5px; letter-spacing:.06em; }
.rd .form-head .quota .link-btn { margin-left:14px; }
.rd .form-head .quota .num { font-size:14px; color:var(--vial); font-weight:500; }
.rd .form-body { padding:26px 24px 0; }
.rd .form-body .ttl { display:block; font-family:var(--serif); font-weight:600; font-size:clamp(20px,1.7vw,24px); color:var(--vial);
  letter-spacing:.05em; font-feature-settings:"palt"; line-height:1.5; }
.rd .form-body .sub { margin-top:8px; font-size:13.5px; line-height:1.8; color:var(--ink2); }
.rd textarea.sheet { display:block; width:100%; height:258px; min-height:162px; resize:vertical; margin-top:18px;
  border:1px solid var(--line2); border-width:1px 0; outline:none; background-color:transparent;
  background-image:linear-gradient(to bottom, transparent 31px, var(--line) 31px); background-size:100% 32px;
  background-attachment:local; background-position:0 1px;
  font-family:var(--jp); font-size:16px; line-height:32px; letter-spacing:.03em; color:var(--ink); padding:1px 4px 0;
  caret-color:var(--signal); transition:border-color .25s; }
.rd textarea.sheet::placeholder { color:#636f6a; opacity:1; }
.rd textarea.sheet:hover { border-color:var(--ink3); }
.rd textarea.sheet:focus { border-color:var(--vial) !important; box-shadow:0 1px 0 var(--vial), 0 -1px 0 var(--vial); }
.rd .under { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; padding:14px 0 18px; }
.rd .samples, .rd .chips { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
.rd .samples .lbl { font-size:12.5px; color:var(--ink3); margin-right:4px; letter-spacing:.06em; }
.rd .chip { min-height:44px; padding:6px 14px; border:1px solid var(--line2); font-size:13.5px; font-weight:500; letter-spacing:.04em;
  line-height:1.5; color:var(--ink); background:transparent; transition:background .25s, color .25s, border-color .25s; }
.rd .chip:hover { border-color:var(--vial); color:var(--vial); }
.rd .chip.on, .rd .chip.on:hover { background:var(--vial); border-color:var(--vial); color:var(--cream); }
.rd .count { flex:none; padding-top:10px; font-size:12.5px; color:var(--ink3); white-space:nowrap; }
.rd .count .num { font-size:14px; color:var(--ink); }
.rd .cond { border-top:1px solid var(--line); padding:14px 0 16px; }
.rd .cond .k { display:block; font-size:12.5px; color:var(--ink3); letter-spacing:.04em; }
.rd .cond-row { display:flex; align-items:center; gap:6px 14px; }
.rd .cond-row .v { flex:1; min-width:0; font-size:14.5px; font-weight:700; color:var(--vial); line-height:1.7; }
.rd .cond .note { font-size:12.5px; color:var(--ink3); line-height:1.7; }
.rd .run { display:flex; align-items:center; gap:10px 20px; padding:18px 24px; border-top:1px solid var(--vial); flex-wrap:wrap; }
.rd .btn-run { min-height:56px; padding:10px 34px; font-size:16px; }
.rd .run .hint { font-size:13px; color:var(--ink3); line-height:1.7; }
.rd .run .hint.warn { color:var(--warn); font-weight:700; }

/* ---------- 段（選択・結果に共通） ---------- */
.rd .blk { border-top:1px solid var(--vial); padding:20px 0 8px; }
.rd .blk.tint { border:1px solid var(--line2); padding:20px 24px 22px; }
.rd .blk.tint.acc { background:var(--acc-bg); border-color:var(--acc-bd); }
.rd .blk.tint.ok { background:var(--ok-bg); border-color:var(--ok-bd); }
.rd .blk.tint.warn { background:var(--warn-bg); border-color:var(--warn-bd); }
.rd .blk.tint.danger { background:var(--danger-bg); border-color:var(--danger-bd); }
.rd .blk.tint.plain { background:var(--paper2); border-color:var(--line); }
.rd .blk.tint.slim { padding:12px 18px; }
.rd .blk-h { font-family:var(--serif); font-weight:600; font-size:18px; color:var(--vial); letter-spacing:.05em; line-height:1.6; font-feature-settings:"palt"; }
.rd .blk.warn .blk-h { color:var(--warn); }
.rd .blk-aside { font-family:var(--jp); font-weight:400; font-size:12px; color:var(--ink3); letter-spacing:.02em; margin-left:.6em; }
.rd .blk-sub { font-size:12.5px; color:var(--ink3); line-height:1.7; margin-top:2px; }
.rd .blk-k { font-size:13px; font-weight:700; color:var(--vial); margin-bottom:4px; }
.rd .blk-k.muted { font-weight:400; font-size:12.5px; color:var(--ink3); }
.rd .blk-p { font-size:13.5px; color:var(--ink2); line-height:1.8; margin-top:6px; }
.rd .blk-p.ink { color:var(--ink); margin-top:0; }
.rd .blk-p.strong { color:var(--danger); font-weight:700; margin:0 0 10px; }
.rd .blk.warn.slim .blk-p { margin:0; font-size:12.5px; color:#5c3d00; line-height:1.7; }
.rd .item { padding:14px 0; border-top:1px solid var(--line); }
.rd .blk-h + .item, .rd .blk-sub + .item { border-top:0; }
.rd .blk.tint.ok .item { border-top-color:var(--ok-bd); }
.rd .blk.tint .item:last-child { padding-bottom:0; }
.rd .item-k { font-size:13.5px; font-weight:700; color:var(--ink); line-height:1.7; }
.rd .item-v { font-size:14.5px; color:var(--ink); line-height:1.8; margin-top:2px; }
.rd .item-n { font-size:12.5px; color:var(--ink3); line-height:1.7; margin-top:6px; }

/* ---------- 業種・媒体の選択 ---------- */
.rd .step-head { display:flex; align-items:baseline; gap:12px; flex-wrap:wrap; }
.rd .step-num { font-family:var(--mono); font-size:12.5px; letter-spacing:.08em; color:var(--signal); }
.rd .step-num.done { color:var(--vial); }
.rd .step-num.off { color:var(--line2); }
.rd .picked { font-size:13px; font-weight:700; color:var(--vial); }
.rd .step-sub { font-size:12.5px; color:var(--ink3); line-height:1.7; margin:2px 0 14px; }
.rd .step-note { font-size:12.5px; color:var(--ink3); line-height:1.7; margin-bottom:8px; }
.rd .grid { display:grid; gap:8px; }
.rd .grid.ind { grid-template-columns:repeat(auto-fill, minmax(158px, 1fr)); }
.rd .grid.med { grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); }
.rd .tile { text-align:left; min-height:48px; padding:11px 13px; border:1px solid var(--line2); background:transparent; color:var(--ink);
  transition:border-color .25s, background .25s, color .25s; }
.rd .tile:hover { border-color:var(--vial); }
.rd .tile.on { background:var(--vial); border-color:var(--vial); color:var(--cream); }
.rd .tile .t1 { font-size:14px; font-weight:700; line-height:1.55; }
.rd .tile .t2 { font-size:12px; color:var(--ink3); margin-top:3px; line-height:1.55; }
.rd .tile.on .t2 { color:#d6e6e0; }
.rd .subs { margin-top:14px; }
.rd .client { margin-top:16px; padding:14px 16px 16px; background:var(--paper2); border-left:2px solid var(--signal); }
.rd .client-h { font-size:13.5px; font-weight:700; margin-bottom:4px; }
.rd .client-h .req { color:var(--signal); margin-left:.4em; }
.rd .med-note { font-size:12.5px; color:var(--vial); margin-top:10px; line-height:1.7; }
.rd .blk:has(.grid) { padding-bottom:16px; }

/* ---------- 診断中・エラー ---------- */
.rd .blk.loading { position:relative; border-top-color:var(--line2); padding:16px 0 8px; overflow:hidden; }
.rd .blk.loading .bar { position:absolute; top:-1px; left:0; width:28%; height:2px; background:var(--vial); animation:rdslide 1.4s var(--ease) infinite; }
.rd .blk.loading .msg { font-size:13.5px; color:var(--ink2); }
@keyframes rdslide { from { transform:translateX(-100%); } to { transform:translateX(460%); } }

/* ---------- 結果 ---------- */
.rd .res { display:flex; flex-direction:column; gap:20px; scroll-margin-top:92px; }
.rd .verdict-row { display:flex; align-items:center; justify-content:space-between; gap:14px 24px; flex-wrap:wrap; }
.rd .verdict-j { font-family:var(--serif); font-weight:700; font-size:34px; line-height:1.3; letter-spacing:.06em; font-feature-settings:"palt"; }
.rd .scores { display:flex; gap:26px; text-align:center; }
.rd .scores .n { font-family:var(--mono); font-variant-numeric:tabular-nums; font-size:30px; font-weight:500; line-height:1.2; color:var(--ink); }
.rd .scores .l { font-size:12px; color:var(--ink2); line-height:1.6; }
.rd .verdict-sum { font-size:14.5px; line-height:1.9; color:var(--ink); margin-top:14px; padding-top:14px; border-top:1px solid rgba(29,43,39,.18); }
.rd .orig { font-size:15px; line-height:2.1; white-space:pre-wrap; margin-top:10px; }
.rd mark { padding:2px 3px; }
.rd mark.HIGH { background:#f3cfc4; color:#7a1c12; }
.rd mark.MEDIUM { background:#f1dfae; color:#5c3d00; }
.rd mark.LOW { background:#cfdcec; color:#173a6b; }
.rd .risk-head { display:flex; align-items:flex-start; gap:10px; margin-bottom:6px; flex-wrap:wrap; }
.rd .lv { font-family:var(--mono); font-size:11.5px; font-weight:500; letter-spacing:.1em; padding:2px 9px; border:1px solid; flex-shrink:0; margin-top:3px; }
.rd .risk-expr { font-size:15px; font-weight:700; line-height:1.7; }
.rd .risk-reason { font-size:13.5px; color:var(--ink2); line-height:1.8; margin-bottom:8px; }
.rd .cell { padding:10px 14px 12px; border-left:2px solid; margin-bottom:8px; }
.rd .cell.ok { background:var(--ok-bg); border-color:var(--ok); }
.rd .cell.ng { background:var(--danger-bg); border-color:var(--danger); }
.rd .cell-k { font-size:12px; font-weight:700; letter-spacing:.06em; line-height:1.7; }
.rd .cell.ok .cell-k { color:var(--ok); }
.rd .cell.ng .cell-k { color:var(--danger); }
.rd .cell-v { font-size:14px; line-height:1.8; color:var(--ink); }
.rd .pair { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.rd .pair .cell { margin-bottom:0; }
.rd .law { display:inline-block; font-size:12px; font-weight:700; color:var(--vial); border:1px solid var(--acc-bd); background:var(--acc-bg); padding:1px 9px; line-height:1.7; }
.rd .proof { display:flex; gap:6px 20px; flex-wrap:wrap; padding:10px 0 12px; margin-top:8px; border-top:1px solid var(--line); border-bottom:1px solid var(--line);
  font-size:12px; color:var(--ink3); line-height:1.7; }
.rd .proof b { color:var(--ink); font-weight:700; }
.rd .proof + .item { border-top:0; }
.rd .src { display:inline-flex; align-items:center; min-height:32px; font-size:12.5px; color:var(--vial); text-underline-offset:4px; }
.rd .src:hover { color:var(--signal); }
.rd .advice { font-family:var(--serif); font-weight:600; font-size:15.5px; line-height:2; color:var(--ink); }
.rd .fold { display:flex; align-items:baseline; gap:10px; width:100%; min-height:44px; text-align:left; font-size:13.5px; font-weight:700; color:var(--ink); line-height:1.7; }
.rd .fold-i { font-family:var(--mono); color:var(--signal); width:1em; flex:none; }
.rd .match { padding:9px 0; border-top:1px solid var(--line); }
.rd .match-head { display:flex; gap:10px; align-items:baseline; flex-wrap:wrap; }
.rd .match-risk { font-family:var(--mono); font-variant-numeric:tabular-nums; font-size:12.5px; font-weight:500; min-width:2.2em; }
.rd .match-ng { font-size:13.5px; font-weight:700; }
.rd .match-genre { font-size:11.5px; color:var(--ink3); }
.rd .match-law { font-family:var(--mono); font-size:11.5px; color:var(--vial); }
.rd .match-c { font-size:12.5px; color:var(--ink2); line-height:1.7; }
.rd .blk.apply { border:1px solid var(--vial); background:var(--sheet); padding:24px 24px 22px; }
.rd .apply-h { font-family:var(--serif); font-weight:700; font-size:20px; color:var(--vial); letter-spacing:.05em; line-height:1.6; font-feature-settings:"palt"; }
.rd .quote { display:flex; flex-wrap:wrap; gap:0; margin:14px 0 4px; border-top:1px solid var(--line2); border-bottom:1px solid var(--line2); }
.rd .quote > div { flex:1 1 auto; padding:12px 20px 12px 0; margin-right:20px; border-right:1px solid var(--line); }
.rd .quote > div:last-child { border-right:0; margin-right:0; padding-right:0; }
.rd .quote .l { font-size:12px; color:var(--ink3); line-height:1.6; }
.rd .quote .n { font-family:var(--mono); font-variant-numeric:tabular-nums; font-size:17px; font-weight:500; color:var(--ink); line-height:1.6; }
.rd .copy { font-size:13px; line-height:1.8; margin-top:12px; }
.rd .copy.ok { color:var(--vial); }
.rd .copy.fail { color:#5c3d00; }
.rd textarea.apply-text { display:block; width:100%; min-height:180px; margin-top:8px; padding:10px 12px; font-family:var(--jp); font-size:12.5px; line-height:1.7;
  border:1px solid var(--line2); background:var(--paper2); color:var(--ink); outline:none; resize:vertical; }
.rd textarea.apply-text:focus { border-color:var(--vial) !important; }

/* ---------- フッター ---------- */
.rd.rd-ft { background:var(--vial-deep); color:#e3eee9; padding:48px 0 0; }
.rd-ft .ft-grid { display:grid; grid-template-columns:5fr 4fr 3fr; gap:clamp(28px,4vw,64px); padding-bottom:40px; }
.rd-ft .logo { color:var(--cream); }
.rd-ft .logo .lab { color:var(--vial-bright); }
.rd-ft .logo .ad { color:#ef8a66; }
.rd-ft .ft-h { color:var(--amber-l); margin-bottom:8px; }
.rd-ft ul { list-style:none; margin:0; padding:0; }
.rd-ft li a { display:inline-flex; align-items:center; min-height:44px; font-size:14px; text-decoration:none; color:#e3eee9; position:relative; }
.rd-ft li a::after { content:""; position:absolute; left:0; right:0; bottom:9px; height:1px; background:var(--amber-l);
  transform:scaleX(0); transform-origin:left; transition:transform .35s var(--ease); }
.rd-ft li a:hover::after { transform:scaleX(1); }
.rd-ft .ft-bottom { border-top:1px solid rgba(243,241,233,.25); padding-top:6px; padding-bottom:10px; color:#cfe3dc; }
.rd-ft .ft-bottom a { display:inline-flex; align-items:center; min-height:44px; text-decoration:none; }
.rd-ft .ft-bottom a:hover { color:var(--amber-l); }

/* ---------- 狭い画面 ---------- */
@media (max-width:1020px) {
  .rd .navlink { display:none; }
  .rd .first { grid-template-columns:1fr; gap:24px; padding-top:28px; }
  .rd .intro { position:static; display:contents; }
  .rd .intro .head { order:1; }
  .rd .col { order:2; }
  .rd .facts { order:3; margin-top:8px; }
  .rd .intro .lead { max-width:none; }
  .rd-ft .ft-grid { grid-template-columns:1fr 1fr; }
  .rd-ft .ft-grid > div:first-child { grid-column:1/-1; }
}
@media (max-width:640px) {
  .rd .nav .wrap { height:60px; gap:8px; }
  .rd .logo { font-size:15px; }
  .rd .logo svg { width:22px; height:22px; margin-right:7px; }
  .rd .tool { font-size:13px; margin-left:9px; padding-left:9px; letter-spacing:.02em; }
  .rd .nav .btn { padding:6px 9px; font-size:12.5px; letter-spacing:.02em; flex:none; }
  .rd .top { padding-top:18px; padding-bottom:36px; }
  .rd .mast { padding-bottom:10px; }
  .rd .mast span:nth-child(2) { display:none; }
  .rd .first { padding-top:20px; gap:20px; }
  .rd .intro .kicker { display:none; }
  .rd .intro h1 { font-size:38px; }
  .rd .intro .tag { margin-top:8px; font-size:14px; }
  .rd .intro .lead { margin-top:12px; font-size:14.5px; line-height:1.8; }
  .rd .form-head { padding:0 14px; }
  .rd .form-body { padding:18px 14px 0; }
  .rd .form-body .sub { font-size:13px; }
  .rd textarea.sheet { height:194px; }
  .rd .under { flex-direction:column-reverse; gap:6px; padding-top:8px; }
  .rd .count { align-self:flex-end; padding-top:0; }
  .rd .samples .lbl { width:100%; }
  .rd .cond-row { align-items:flex-start; }
  .rd .run { padding:16px 14px; }
  .rd .btn-run { width:100%; }
  .rd .blk.tint, .rd .blk.apply { padding-left:16px; padding-right:16px; }
  .rd .scores { gap:18px; }
  .rd .pair { grid-template-columns:1fr; }
  .rd .quote > div { flex-basis:100%; border-right:0; border-bottom:1px solid var(--line); margin-right:0; padding-right:0; }
  .rd .quote > div:last-child { border-bottom:0; }
  .rd .acts .more { margin-left:0; }
  .rd .sign { text-align:left; margin-top:40px; }
  .rd-ft .ft-grid { grid-template-columns:1fr; gap:24px; }
}
@media (prefers-reduced-motion:reduce) {
  .rd *, .rd *::before, .rd *::after { transition:none !important; animation:none !important; }
  .rd .blk.loading .bar { width:100%; }
}
`;
