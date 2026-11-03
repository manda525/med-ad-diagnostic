import Head from "next/head";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  STATUS, STATUS_LABEL, isTerminal, yen, buildSubject, buildMetaLines, buildApplyText, buildMailto,
} from "../lib/supervise";
import { getStorage, readLocal, getLocal, removeLocal } from "../lib/superviseLocal";

// 監修の依頼の状況ページ。/supervise?id=SV-XXXX-XXXX-XXXX
// 依頼IDを知っている人にだけ状態を見せる。IDなしで開くと、この端末で依頼した一覧を出す。
// 原稿はこの端末のブラウザにだけある（サーバーには保存しない）。

const CONTACT_EMAIL = "masa@med-ad-masa.com";
const POLL_MS = 60 * 1000;

// 進み具合の4段階。取消はこの流れの外に出す。
const STEPS = [
  { key: STATUS.AWAITING_PAYMENT, label: "お支払い" },
  { key: STATUS.PAID, label: "原稿のご送付" },
  { key: STATUS.REVIEWING, label: "確認中" },
  { key: STATUS.DELIVERED, label: "納品" },
];

function formatAt(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 状態ごとの「次にすること」。画面の文言はここに集めておく。
function nextAction(status) {
  switch (status) {
    case STATUS.AWAITING_PAYMENT:
      return { title: "お支払いがまだ確認できていません", body: "お支払い画面を閉じてしまった場合は、下のボタンから開き直せます。お支払いが済んでいる場合は、少し待ってから「状態を更新」を押してください。" };
    case STATUS.PAID:
      return { title: "原稿をメールでお送りください", body: "お支払いを確認しました。下のボタンで申込内容（原稿の全文つき）をコピーしてメールを開き、本文に貼り付けて送信してください。原稿を受け取ると、状態が「確認中」に変わります。納品の目安は原稿の受領から2営業日です。" };
    case STATUS.REVIEWING:
      return { title: "確認中です", body: "原稿を受け取り、監修を進めています。納品の目安は原稿の受領から2営業日です。納品はメールでお送りします。" };
    case STATUS.DELIVERED:
      return { title: "納品しました", body: `納品はメールでお送りしています。届いていない場合は、迷惑メールフォルダをご確認のうえ、${CONTACT_EMAIL} までご連絡ください（件名に依頼IDを添えてください）。` };
    case STATUS.CANCELLED:
      return { title: "この依頼は取り消されました", body: `お支払い済みの場合の返金については、${CONTACT_EMAIL} までご連絡ください（件名に依頼IDを添えてください）。` };
    default:
      return null;
  }
}

function Timeline({ status, history }) {
  const at = Object.fromEntries((history || []).map((h) => [h.status, h.at]));
  const currentIndex = STEPS.findIndex((s) => s.key === status);
  // 時刻を出せる段階だけ出す。お支払い＝受付済みになった時刻、確認中・納品＝それぞれになった時刻
  const stamp = [at[STATUS.PAID], null, at[STATUS.REVIEWING], at[STATUS.DELIVERED]];
  return (
    <ol style={{ listStyle: "none", margin: "0 0 4px", padding: 0, display: "grid", gap: 10 }}>
      {STEPS.map((s, i) => {
        // 納品済みなら全段階が完了。それ以外は現在より前の段階が完了
        const done = i < currentIndex || status === STATUS.DELIVERED;
        const current = i === currentIndex && status !== STATUS.DELIVERED;
        const label = current && s.key === STATUS.PAID ? "原稿のご送付（お待ちしています）" : s.label;
        return (
          <li key={s.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              aria-hidden="true"
              style={{
                width: 22, height: 22, borderRadius: "50%", flexShrink: 0, display: "inline-flex",
                alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700,
                background: done ? "var(--acc)" : current ? "var(--ink)" : "var(--line2)",
                color: "#fff",
              }}
            >
              {done ? "✓" : i + 1}
            </span>
            <span style={{ fontSize: 14, fontWeight: current ? 700 : 500, color: done || current ? "var(--ink)" : "var(--ink3)" }}>
              {label}
            </span>
            {stamp[i] && (done || current) && (
              <span style={{ fontSize: 11.5, color: "var(--ink3)" }}>{formatAt(stamp[i])}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default function SupervisePage() {
  const [ready, setReady] = useState(false);
  const [id, setId] = useState("");
  const [inputId, setInputId] = useState("");
  const [view, setView] = useState(null); // 取得済みの依頼（公開用の見え方）
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [locals, setLocals] = useState([]);
  const [local, setLocal] = useState(null); // この端末にある原稿つきの控え
  const [copyState, setCopyState] = useState("");
  const [showText, setShowText] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState("");
  const timer = useRef(null);

  const load = useCallback(async (targetId, { quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const r = await fetch(`/api/supervise/status?id=${encodeURIComponent(targetId)}`);
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setView(null);
        setError(data.error || "状態を取得できませんでした。");
      } else {
        setView(data);
        setError("");
      }
    } catch {
      if (!quiet) setError("通信に失敗しました。電波の良いところでもう一度お試しください。");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  // 初回：URLのIDを読み、この端末の控えを読む
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = (params.get("id") || "").trim();
    const storage = getStorage();
    setLocals(readLocal(storage));
    if (q) {
      setId(q);
      setInputId(q);
      setLocal(getLocal(storage, q.toUpperCase()));
      load(q);
    }
    setReady(true);
  }, [load]);

  // 終わっていない依頼は、画面を開いている間だけ1分ごとに更新する
  useEffect(() => {
    clearInterval(timer.current);
    if (!id || !view || isTerminal(view.status)) return undefined;
    timer.current = setInterval(() => {
      if (document.visibilityState === "visible") load(id, { quiet: true });
    }, POLL_MS);
    return () => clearInterval(timer.current);
  }, [id, view, load]);

  const open = useCallback((targetId) => {
    const next = targetId.trim();
    if (!next) return;
    window.history.replaceState({}, "", `/supervise?id=${encodeURIComponent(next)}`);
    setId(next);
    setView(null);
    setError("");
    setCopyState("");
    setShowText(false);
    setLocal(getLocal(getStorage(), next.toUpperCase()));
    load(next);
  }, [load]);

  // 申込内容（依頼ID・支払い済みの旨つき）。原稿が端末にあるときだけ作れる。
  const apply = useMemo(() => {
    if (!view || !local) return null;
    const common = { ...local.meta, requestId: view.id, paidTotal: view.total };
    return {
      text: buildApplyText({ metaLines: buildMetaLines(common), text: local.text }),
      mailto: buildMailto({ email: CONTACT_EMAIL, subject: buildSubject(common) }),
    };
  }, [view, local]);

  const copyAndOpenMail = useCallback(async () => {
    if (!apply) return;
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(apply.text);
        ok = true;
      }
    } catch {
      ok = false;
    }
    setCopyState(ok ? "ok" : "fail");
    if (ok) window.location.href = apply.mailto;
    else setShowText(true);
  }, [apply]);

  const resumePayment = useCallback(async () => {
    if (!view || payBusy) return;
    setPayBusy(true);
    setPayError("");
    try {
      const r = await fetch("/api/supervise/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: view.id }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      if (r.ok) {
        await load(view.id, { quiet: true }); // すでに支払い済みだった
      } else {
        setPayError(data.error || "お支払いの画面を開けませんでした。");
      }
    } catch {
      setPayError("通信に失敗しました。もう一度お試しください。");
    }
    setPayBusy(false);
  }, [view, payBusy, load]);

  const deleteLocalCopy = useCallback(() => {
    if (!view) return;
    removeLocal(getStorage(), view.id);
    setLocal(null);
    setLocals(readLocal(getStorage()));
    setShowText(false);
    setCopyState("");
  }, [view]);

  const action = view ? nextAction(view.status) : null;
  const card = { background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 14, padding: "1.25rem 1.4rem", marginBottom: 14 };
  const primary = { fontSize: 14, padding: "11px 26px", borderRadius: 8, border: "none", background: "var(--ink)", color: "#fff", fontWeight: 600, cursor: "pointer" };
  const ghost = { fontSize: 13, padding: "10px 18px", borderRadius: 8, border: "1px solid var(--line2)", background: "var(--paper)", color: "var(--ink2)", cursor: "pointer" };

  return (
    <>
      <Head>
        <title>監修の依頼状況 | 薬機レーダー</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
      </Head>
      <div
        style={{
          "--ink": "#182430", "--ink2": "#44576B", "--ink3": "#8296A9", "--line": "#E3E9EF", "--line2": "#CBD6E0",
          "--paper": "#FFFFFF", "--paper2": "#F6F8FA", "--acc": "#0E5E6F", "--acc-bg": "#EAF4F5", "--acc-bd": "#9CC5CC",
          maxWidth: 720, margin: "0 auto", padding: "28px 16px 64px", color: "var(--ink)",
          fontFamily: "var(--font-sans)", lineHeight: 1.7,
        }}
      >
        <Link href="/" style={{ display: "inline-block", marginBottom: 18, color: "var(--ink2)", textDecoration: "none", fontSize: 14 }}>
          ← 診断ツールに戻る
        </Link>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px", fontFamily: '"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif' }}>
          監修の依頼状況
        </h1>
        <p style={{ fontSize: 12.5, color: "var(--ink3)", margin: "0 0 18px" }}>
          依頼IDを知っている方だけが、この画面で状態を確認できます。
        </p>

        {!ready && <p style={{ fontSize: 13, color: "var(--ink3)" }}>読み込み中…</p>}

        {ready && !id && (
          <>
            <div style={card}>
              <p style={{ fontSize: 14, fontWeight: 600, margin: "0 0 8px" }}>依頼IDで確認する</p>
              <form
                onSubmit={(e) => { e.preventDefault(); open(inputId); }}
                style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
              >
                <input
                  value={inputId}
                  onChange={(e) => setInputId(e.target.value)}
                  placeholder="SV-XXXX-XXXX-XXXX"
                  aria-label="依頼ID"
                  autoCapitalize="characters"
                  style={{ flex: "1 1 220px", fontSize: 15, padding: "10px 12px", border: "1px solid var(--line2)", borderRadius: 8, fontFamily: "var(--font-mono)" }}
                />
                <button type="submit" style={primary}>確認する</button>
              </form>
            </div>
            <div style={card}>
              <p style={{ fontSize: 14, fontWeight: 600, margin: "0 0 8px" }}>この端末で依頼したもの</p>
              {locals.length === 0 && (
                <p style={{ fontSize: 12.5, color: "var(--ink3)", margin: 0 }}>
                  この端末には依頼の控えがありません。ほかの端末で依頼した場合は、依頼IDを入力してください。
                </p>
              )}
              {locals.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => open(e.id)}
                  style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", borderTop: "1px solid var(--line)", padding: "10px 0", cursor: "pointer", color: "var(--ink)" }}
                >
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 13.5, fontWeight: 600 }}>{e.id}</span>
                  <span style={{ fontSize: 12, color: "var(--ink3)", marginLeft: 10 }}>
                    {formatAt(e.createdAt)}・{(e.meta && e.meta.length ? e.meta.length.toLocaleString() : "")}文字
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {ready && id && loading && !view && <p style={{ fontSize: 13, color: "var(--ink3)" }}>確認しています…</p>}

        {ready && id && error && !view && (
          <div style={card}>
            <p role="alert" style={{ fontSize: 14, color: "#B42318", margin: "0 0 10px" }}>{error}</p>
            <button type="button" style={ghost} onClick={() => load(id)}>もう一度確認する</button>
            {" "}
            <a href="/supervise" style={{ fontSize: 13, color: "var(--acc)", marginLeft: 8 }} onClick={(e) => { e.preventDefault(); window.history.replaceState({}, "", "/supervise"); setId(""); setError(""); }}>
              別の依頼IDで確認する
            </a>
          </div>
        )}

        {view && (
          <>
            <div style={card}>
              <p style={{ fontSize: 11, color: "var(--ink3)", margin: 0 }}>依頼ID</p>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, margin: "0 0 12px", letterSpacing: "0.02em" }}>{view.id}</p>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                <span
                  style={{
                    fontSize: 13, fontWeight: 700, padding: "4px 12px", borderRadius: 999,
                    background: view.status === STATUS.CANCELLED ? "#FEF3F2" : "var(--acc-bg)",
                    color: view.status === STATUS.CANCELLED ? "#B42318" : "var(--acc)",
                    border: `1px solid ${view.status === STATUS.CANCELLED ? "#FDA29B" : "var(--acc-bd)"}`,
                  }}
                >
                  {STATUS_LABEL[view.status] || view.status}
                </span>
                <span style={{ fontSize: 12, color: "var(--ink3)" }}>最終更新 {formatAt(view.updatedAt)}</span>
                <button type="button" style={{ ...ghost, padding: "5px 12px", fontSize: 12 }} onClick={() => load(view.id)} disabled={loading}>
                  {loading ? "更新中…" : "状態を更新"}
                </button>
              </div>
              {view.status !== STATUS.CANCELLED && <Timeline status={view.status} history={view.history} />}
            </div>

            {action && (
              <div style={{ ...card, border: "2px solid var(--ink)" }}>
                <p style={{ fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>{action.title}</p>
                <p style={{ fontSize: 13, color: "var(--ink2)", margin: "0 0 12px" }}>{action.body}</p>

                {view.status === STATUS.AWAITING_PAYMENT && (
                  <>
                    <button type="button" style={{ ...primary, opacity: payBusy ? 0.6 : 1 }} onClick={resumePayment} disabled={payBusy}>
                      {payBusy ? "お支払い画面を開いています…" : "お支払いに進む"}
                    </button>
                    {payError && <p role="alert" style={{ fontSize: 12.5, color: "#B42318", margin: "8px 0 0" }}>{payError}</p>}
                  </>
                )}

                {view.status === STATUS.PAID && (
                  <>
                    {apply ? (
                      <>
                        <button type="button" style={primary} onClick={copyAndOpenMail}>申込内容をコピーしてメールを開く</button>
                        {copyState === "ok" && (
                          <p style={{ fontSize: 12.5, color: "var(--acc)", margin: "10px 0 0" }}>
                            ✓ 申込内容（原稿の全文つき）をコピーしました。開いたメールの本文に貼り付けて送信してください。
                          </p>
                        )}
                        {copyState === "fail" && (
                          <p style={{ fontSize: 12.5, color: "#7A2E0E", margin: "10px 0 0" }}>
                            自動コピーができませんでした。下の内容を選択してコピーし、{CONTACT_EMAIL} 宛にお送りください。
                          </p>
                        )}
                        <p style={{ margin: "10px 0 0" }}>
                          <button type="button" onClick={() => setShowText((v) => !v)}
                            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12, color: "var(--ink3)", textDecoration: "underline" }}>
                            {showText ? "申込内容を隠す" : "メールが開かない場合はこちら（申込内容を表示）"}
                          </button>
                        </p>
                        {showText && (
                          <textarea readOnly value={apply.text} onFocus={(e) => e.target.select()}
                            style={{ width: "100%", minHeight: 180, marginTop: 8, fontSize: 12, lineHeight: 1.7, padding: 10, border: "1px solid var(--line2)", borderRadius: 8, background: "var(--paper2)", color: "var(--ink)" }} />
                        )}
                      </>
                    ) : (
                      <p style={{ fontSize: 13, margin: 0 }}>
                        この端末には原稿が残っていません。依頼した端末で開くか、
                        <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`【監修申込 ${view.id}】原稿のご送付`)}`} style={{ color: "var(--acc)" }}>
                          {CONTACT_EMAIL}
                        </a>
                        へ、件名に依頼IDを入れて原稿をお送りください。
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            <div style={card}>
              <p style={{ fontSize: 14, fontWeight: 600, margin: "0 0 8px" }}>依頼の内容</p>
              <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 16px", margin: 0, fontSize: 13 }}>
                <dt style={{ color: "var(--ink3)" }}>原稿の分量</dt><dd style={{ margin: 0 }}>{view.length.toLocaleString()}文字</dd>
                <dt style={{ color: "var(--ink3)" }}>業種・媒体</dt>
                <dd style={{ margin: 0 }}>{view.industryLabel}{view.subLabel ? `（${view.subLabel}）` : ""}／{view.mediaLabel || "未指定"}</dd>
                <dt style={{ color: "var(--ink3)" }}>AI一次判定</dt>
                <dd style={{ margin: 0 }}>{view.judgment}{view.riskScore != null ? `（リスクスコア ${view.riskScore}）` : ""}</dd>
                <dt style={{ color: "var(--ink3)" }}>監修料金</dt><dd style={{ margin: 0 }}>¥{yen(view.fee)}（税別）</dd>
                <dt style={{ color: "var(--ink3)" }}>消費税</dt><dd style={{ margin: 0 }}>¥{yen(view.tax)}</dd>
                <dt style={{ color: "var(--ink3)" }}>お支払い額</dt><dd style={{ margin: 0, fontWeight: 700 }}>¥{yen(view.total)}（税込）</dd>
              </dl>
              {local && (
                <p style={{ margin: "12px 0 0", fontSize: 12, color: "var(--ink3)" }}>
                  この端末に原稿の控えがあります（サーバーには保存していません）。
                  {" "}
                  <button type="button" onClick={deleteLocalCopy}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12, color: "var(--ink3)", textDecoration: "underline" }}>
                    この端末から消す
                  </button>
                </p>
              )}
            </div>

            <p style={{ fontSize: 12, color: "var(--ink3)" }}>
              お問い合わせは {CONTACT_EMAIL} へ（件名に依頼IDを添えてください）。{" "}
              <Link href="/tokushoho" style={{ color: "var(--acc)" }}>特定商取引法に基づく表記</Link>
              {" ・ "}
              <a href="/supervise" style={{ color: "var(--acc)" }} onClick={(e) => { e.preventDefault(); window.history.replaceState({}, "", "/supervise"); setId(""); setView(null); setError(""); setLocals(readLocal(getStorage())); }}>
                別の依頼を見る
              </a>
            </p>
          </>
        )}
      </div>
    </>
  );
}
