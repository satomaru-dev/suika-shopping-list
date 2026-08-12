"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Check, Clock3, Copy, History, KeyRound, ListChecks, LoaderCircle, LogOut, Merge, Mic, MicOff, Plus, RotateCcw, Settings, ShoppingBasket, Sparkles, Trash2, X } from "lucide-react";
import ServiceWorkerRegistration from "./service-worker";
import type { MergeCandidate, MergeHistory, Recommendation, ShoppingItem } from "@/lib/types";
import { findSimilarProductNames, searchNameMatches } from "@/lib/normalization";
import { splitSpokenItems } from "@/lib/voice";

type Tab = "list" | "soon" | "history" | "settings";
type SessionStatus = { authenticated: boolean; setupRequired: boolean; demo: boolean };
type SiriToken = { id: string; label: string; created_at?: string; last_used_at?: string | null };
type HistorySort = "recent" | "oldest" | "name" | "name-desc";

function formatPurchaseDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric" }).format(new Date(`${value}T00:00:00+09:00`));
}

function formatIsoDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric" }).format(new Date(value));
}
type MergeProduct = { id: string; name: string };
const IGNORED_MERGES_KEY = "suika-ignored-merge-candidates-v2";

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "通信に失敗しました。" }));
    throw new Error(body.error ?? "通信に失敗しました。");
  }
  return response.status === 204 ? ({} as T) : response.json();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatHistoryDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric" }).format(new Date(value));
}

function EmptyState({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{text}</p></div>;
}

function AuthScreen({ status, onDone }: { status: SessionStatus; onDone: () => void }) {
  const [pin, setPin] = useState("");
  const [secret, setSecret] = useState("");
  const [name, setName] = useState("わが家");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      if (status.setupRequired) {
        await api("/api/auth/setup", { method: "POST", body: JSON.stringify({ setupSecret: secret, pin, name }) });
      }
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ pin }) });
      onDone();
    } catch (err) { setError(err instanceof Error ? err.message : "失敗しました。"); }
    finally { setBusy(false); }
  }
  return <main className="auth-shell">
    <section className="auth-card">
      <Image className="auth-logo" src="/icons/icon-192.png" alt="スイカのアイコン" width={92} height={92} priority />
      <p className="eyebrow">家族のための</p><h1>買い物リスト</h1>
      <p className="auth-lead">声で追加して、買い忘れをすっきり。</p>
      <form onSubmit={submit} className="auth-form">
        {status.setupRequired && <><label>家族名<input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} /></label><label>セットアップ用の合言葉<input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} required /></label></>}
        <label>共通PIN<input className="pin-input" type="password" inputMode="numeric" pattern="[0-9]{4,12}" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="4〜12桁" required /></label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <KeyRound />} {status.setupRequired ? "はじめる" : "入る"}</button>
      </form>
    </section>
  </main>;
}

export default function ShoppingApp() {
  const [session, setSession] = useState<SessionStatus | null>(null);
  const [tab, setTab] = useState<Tab>("list");
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [historyItems, setHistoryItems] = useState<ShoppingItem[]>([]);
  const [historySort, setHistorySort] = useState<HistorySort>("recent");
  const [historyQuery, setHistoryQuery] = useState("");
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);
  const [editHistoryName, setEditHistoryName] = useState("");
  const [editHistoryDate, setEditHistoryDate] = useState("");
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [expandedRecommendation, setExpandedRecommendation] = useState<string | null>(null);
  const [knownNames, setKnownNames] = useState<string[]>([]);
  const [mergeCandidates, setMergeCandidates] = useState<MergeCandidate[]>([]);
  const [mergeHistory, setMergeHistory] = useState<MergeHistory[]>([]);
  const [draggedProduct, setDraggedProduct] = useState<MergeProduct | null>(null);
  const [ignoredMergeKeys, setIgnoredMergeKeys] = useState<string[]>([]);
  const [siriTokens, setSiriTokens] = useState<SiriToken[]>([]);
  const [newSiriToken, setNewSiriToken] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [inputSource, setInputSource] = useState<"web" | "voice">("web");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  const previewNames = useMemo(() => splitSpokenItems(input, knownNames), [input, knownNames]);
  const searchedHistoryItems = useMemo(() => {
    const query = historyQuery.trim();
    if (!query) return historyItems;
    return historyItems.filter((item) => {
      return searchNameMatches(query, item.name);
    });
  }, [historyItems, historyQuery]);
  const sortedHistoryItems = useMemo(() => [...searchedHistoryItems].sort((a, b) => {
    if (historySort === "name") return a.name.localeCompare(b.name, "ja");
    if (historySort === "name-desc") return b.name.localeCompare(a.name, "ja");
    const left = new Date(a.purchasedAt ?? a.addedAt).getTime();
    const right = new Date(b.purchasedAt ?? b.addedAt).getTime();
    return historySort === "oldest" ? left - right : right - left;
  }), [searchedHistoryItems, historySort]);
  const similarProductNames = useCallback((name: string) => {
    return findSimilarProductNames(name, historyItems.map((item) => item.name));
  }, [historyItems]);
  const notify = useCallback((message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2600); }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(IGNORED_MERGES_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setIgnoredMergeKeys(JSON.parse(saved) as string[]);
    } catch { /* 保存データが壊れていてもアプリは継続 */ }
  }, []);

  const loadSession = useCallback(async () => { try { setSession(await api<SessionStatus>("/api/auth/session")); } catch { setSession({ authenticated: false, setupRequired: false, demo: false }); } }, []);
  // 初回だけサーバーのセッション状態と同期する。
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadSession(); }, [loadSession]);

  const refresh = useCallback(async () => {
    if (!session?.authenticated) return;
    setError("");
    try {
      const [pending, history, soon, names] = await Promise.all([
        api<{ items: ShoppingItem[] }>("/api/items?status=pending"),
        api<{ items: ShoppingItem[] }>("/api/items?status=purchased&limit=500"),
        api<{ recommendations: Recommendation[] }>("/api/recommendations"),
        api<{ names: string[] }>("/api/products/names"),
      ]);
      setItems(pending.items); setHistoryItems(history.items); setRecommendations(soon.recommendations); setKnownNames(names.names);
    } catch (err) { setError(err instanceof Error ? err.message : "読み込めませんでした。"); }
  }, [session?.authenticated]);
  // 認証状態が変わったときに一覧をサーバーと同期する。
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (tab === "settings" && session?.authenticated) {
      void Promise.all([api<{ candidates: MergeCandidate[] }>("/api/product-merge-candidates"), api<{ tokens: SiriToken[] }>("/api/siri-tokens"), api<{ history: MergeHistory[] }>("/api/product-merge-history")])
        .then(([merge, tokens, history]) => { setMergeCandidates(merge.candidates); setSiriTokens(tokens.tokens); setMergeHistory(history.history); }).catch(() => undefined);
    }
  }, [tab, session?.authenticated]);

  async function addCurrent(source: "web" | "voice" = inputSource) {
    if (!previewNames.length) return;
    setBusy(true); setError("");
    try {
      const result = await api<{ items: ShoppingItem[]; skipped: number }>("/api/items", { method: "POST", body: JSON.stringify({ names: previewNames, source }) });
      setInput(""); setInputSource("web"); await refresh();
      notify(result.items.length ? `${result.items.length}件追加しました` : "すでにリストに入っています");
    } catch (err) { setError(err instanceof Error ? err.message : "追加できませんでした。"); }
    finally { setBusy(false); }
  }

  function startVoice() {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) { setError("このブラウザは画面内の音声入力に対応していません。文字入力かSiriをご利用ください。"); return; }
    const recognition = new Recognition(); recognition.lang = "ja-JP"; recognition.interimResults = false; recognition.continuous = false;
    recognition.onresult = (event) => { setInput(event.results[0][0].transcript); setInputSource("voice"); setListening(false); };
    recognition.onerror = () => { setListening(false); setError("音声を聞き取れませんでした。マイクの許可を確認してください。"); };
    recognition.onend = () => setListening(false); setError(""); setListening(true); recognition.start();
  }

  async function setPurchased(item: ShoppingItem, purchased: boolean) {
    try { await api(`/api/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ purchased }) }); await refresh(); notify(purchased ? `${item.name}を購入済みにしました` : `${item.name}を買うものへ戻しました`); }
    catch (err) { setError(err instanceof Error ? err.message : "更新できませんでした。"); }
  }

  function startHistoryEdit(item: ShoppingItem) {
    setEditingHistoryId(item.id); setEditHistoryName(item.name); setEditHistoryDate(item.purchasedAt ? item.purchasedAt.slice(0, 10) : "");
  }

  async function saveHistoryEdit(item: ShoppingItem) {
    if (!editHistoryName.trim() || !editHistoryDate) return;
    try {
      await api(`/api/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ productName: editHistoryName.trim() }) });
      await api(`/api/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ purchasedAt: `${editHistoryDate}T12:00:00+09:00` }) });
      setEditingHistoryId(null); await refresh(); notify("購入履歴を修正しました");
    } catch (err) { setError(err instanceof Error ? err.message : "履歴を修正できませんでした"); }
  }

  async function remove(item: ShoppingItem) {
    try { await api(`/api/items/${item.id}`, { method: "DELETE" }); await refresh(); notify(`${item.name}を削除しました`); }
    catch (err) { setError(err instanceof Error ? err.message : "削除できませんでした。"); }
  }

  async function addRecommendation(rec: Recommendation) {
    try { await api(`/api/recommendations/${rec.productId}/add`, { method: "POST" }); await refresh(); setTab("list"); notify(`${rec.name}を追加しました`); }
    catch (err) { setError(err instanceof Error ? err.message : "追加できませんでした。"); }
  }

  async function generateSiriToken() {
    try { const result = await api<{ token: string }>("/api/siri-tokens", { method: "POST", body: JSON.stringify({ label: "iPhone" }) }); setNewSiriToken(result.token); const refreshed = await api<{ tokens: SiriToken[] }>("/api/siri-tokens"); setSiriTokens(refreshed.tokens); notify("iPhone用トークンを発行しました"); }
    catch (err) { setError(err instanceof Error ? err.message : "発行できませんでした。"); }
  }

  async function merge(candidate: MergeCandidate, keep: "left" | "right") {
    const target = keep === "left" ? candidate.left : candidate.right; const source = keep === "left" ? candidate.right : candidate.left;
    try { await api("/api/products/merge", { method: "POST", body: JSON.stringify({ sourceId: source.id, targetId: target.id }) }); setMergeCandidates((current) => current.filter((entry) => entry !== candidate)); await refresh(); notify(`${target.name}にまとめました`); }
    catch (err) { setError(err instanceof Error ? err.message : "統合できませんでした。"); }
  }

  async function mergeProducts(source: MergeProduct, target: MergeProduct) {
    if (source.id === target.id) return;
    try {
      await api("/api/products/merge", { method: "POST", body: JSON.stringify({ sourceId: source.id, targetId: target.id }) });
      setDraggedProduct(null);
      const refreshed = await api<{ candidates: MergeCandidate[] }>("/api/product-merge-candidates");
      setMergeCandidates(refreshed.candidates);
      const history = await api<{ history: MergeHistory[] }>("/api/product-merge-history");
      setMergeHistory(history.history);
      await refresh();
      notify(`${source.name}を${target.name}に統合しました`);
    } catch (err) { setError(err instanceof Error ? err.message : "統合できませんでした"); }
  }

  if (!session) return <main className="loading-screen"><Image src="/icons/icon-192.png" alt="" width={82} height={82} priority /><LoaderCircle className="spin" /></main>;
  if (!session.authenticated) return <AuthScreen status={session} onDone={loadSession} />;

  return <div className="app-shell">
    <ServiceWorkerRegistration />
    <header className="topbar"><div className="brand"><Image src="/icons/icon-192.png" alt="" width={52} height={52} priority /><div><p>わが家の</p><h1>買い物リスト</h1></div></div>{session.demo && <span className="demo-badge">おためし</span>}</header>
    <main className="main-content">
      {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError("")} aria-label="閉じる"><X /></button></div>}
      {tab === "list" && <section>
        <div className="hero-card"><p className="eyebrow light">声でも、指でも</p><h2>なにを買う？</h2><div className="add-row"><input value={input} onChange={(e) => { setInput(e.target.value); setInputSource("web"); }} onKeyDown={(e) => { if (e.key === "Enter") void addCurrent(); }} placeholder="牛乳、卵、パン" aria-label="追加する商品" /><button className={`mic-button ${listening ? "listening" : ""}`} onClick={startVoice} aria-label="音声入力">{listening ? <MicOff /> : <Mic />}</button></div>
        {previewNames.length > 0 && <div className="chip-preview">{previewNames.map((name) => <span key={name}>{name}</span>)}<button onClick={() => void addCurrent()} disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <Plus />}追加</button></div>}</div>
        <div className="section-heading"><div><p className="eyebrow">今日のリスト</p><h2>{items.length}個の買うもの</h2></div>{recommendations.length > 0 && <button className="mini-link" onClick={() => setTab("soon")}><Sparkles />候補 {recommendations.length}</button>}</div>
        <div className="item-list">{items.length ? items.map((item) => { const similarNames = similarProductNames(item.name); return <article className="item-card" key={item.id}><button className="check-button" onClick={() => void setPurchased(item, true)} aria-label={`${item.name}をごろ！にする`}>ごろ！</button><div><h3>{item.name}</h3>{similarNames.length > 0 && <div className="similar-alert"><span>履歴に似た商品があります。これと同じですか？</span>{similarNames.map((name) => <button key={name} onClick={async (event) => { event.stopPropagation(); await api(`/api/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ productName: name }) }); await refresh(); notify(`${name}に変更しました`); }}>{name}</button>)}</div>}</div><button className="icon-button danger" onClick={() => void remove(item)} aria-label="削除"><Trash2 /></button></article>; }) : <EmptyState icon={<ShoppingBasket />} title="リストは空です" text="上の入力欄かマイクから追加してみましょう。" />}</div>
      </section>}

      {tab === "soon" && <section><div className="page-intro"><p className="eyebrow coral">購入リズムから予測</p><h2>そろそろ買うもの</h2><p>3回以上購入した商品を、次の予測日が遠い順に表示しています。</p></div><div className="recommendation-list">{recommendations.length ? recommendations.map((rec) => { const expanded = expandedRecommendation === rec.productId; return <article className={`recommendation-card ${expanded ? "expanded" : ""}`} key={rec.productId} role="button" tabIndex={0} aria-expanded={expanded} onClick={() => setExpandedRecommendation(expanded ? null : rec.productId)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setExpandedRecommendation(expanded ? null : rec.productId); } }}><div className="rec-icon"><Clock3 /></div><div className="rec-body"><div className="rec-top"><h3>{rec.name}</h3><span className={rec.daysUntilExpected < 0 ? "overdue" : "due"}>{rec.daysUntilExpected < 0 ? `${Math.abs(rec.daysUntilExpected)}日超過` : rec.daysUntilExpected === 0 ? "今日ごろ" : `あと${rec.daysUntilExpected}日`}</span></div><p>{rec.purchaseCount}回購入・だいたい{Math.round(rec.medianIntervalDays)}日おき</p><div className="recommendation-detail"><strong>購入履歴</strong><ul>{rec.purchaseDates.map((date) => <li key={date}>{formatPurchaseDate(date)}</li>)}</ul><small>次回予測：{formatIsoDate(rec.expectedAt)}</small></div><button onClick={(event) => { event.stopPropagation(); void addRecommendation(rec); }}><Plus />買うものへ追加</button></div></article>; }) : <EmptyState icon={<Sparkles />} title="今は候補がありません" text="購入履歴が増えると、いつもの商品をここでお知らせします。" />}</div></section>}

      {tab === "history" && <section><div className="page-intro"><p className="eyebrow">全履歴</p><h2>購入履歴</h2><p>商品名を入れると、表記ゆれや似た商品もまとめて検索します。</p><div className="history-search"><span>⌕</span><input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="例：マスタード、チーズ" aria-label="履歴をスーパー検索" />{historyQuery && <button onClick={() => setHistoryQuery("")} aria-label="検索をクリア">×</button>}</div><div className="history-sort"><label htmlFor="history-sort">並び替え</label><select id="history-sort" value={historySort} onChange={(event) => setHistorySort(event.target.value as HistorySort)}><option value="recent">新しい順</option><option value="oldest">古い順</option><option value="name">五十音順（あ→わ）</option><option value="name-desc">五十音逆順（わ→あ）</option></select><small>{historyQuery ? `${sortedHistoryItems.length}件ヒット` : `${historyItems.length}件`}</small></div></div><div className="history-list">{sortedHistoryItems.length ? sortedHistoryItems.map((item) => editingHistoryId === item.id ? <article className="history-card history-edit-card" key={item.id}><div className="history-check"><Check /></div><div className="history-edit-fields"><label>商品名<input value={editHistoryName} onChange={(event) => setEditHistoryName(event.target.value)} /></label><label>購入日<input type="date" value={editHistoryDate} onChange={(event) => setEditHistoryDate(event.target.value)} /></label><div className="history-edit-actions"><button onClick={() => void saveHistoryEdit(item)}>保存</button><button onClick={() => setEditingHistoryId(null)}>キャンセル</button><button className="history-delete-button" onClick={async () => { await remove(item); setEditingHistoryId(null); }}>削除</button></div></div></article> : <article className="history-card" key={item.id}><div className="history-check"><Check /></div><div><h3>{item.name}</h3><p>{formatHistoryDate(item.purchasedAt!)}</p></div><div className="history-actions"><button className="history-edit-button" onClick={() => startHistoryEdit(item)}>編集</button><button className="restore-button" onClick={() => void setPurchased(item, false)}><RotateCcw />戻す</button></div></article>) : <EmptyState icon={<History />} title="該当する履歴がありません" text="別の商品名でも試してみてください。" />}</div></section>}

      {tab === "settings" && <section><div className="page-intro"><p className="eyebrow">つなぐ・整える</p><h2>設定</h2></div>
        <div className="settings-card"><div className="settings-title"><div className="setting-icon siri"><Mic /></div><div><h3>Hey Siriで追加</h3><p>最初の1回だけiPhoneで設定します。</p></div></div><ol className="siri-steps"><li><span>1</span><div><strong>ショートカットを新規作成</strong><p>名前を「買い物リストに追加して」にします。</p><div className="phone-visual"><b>ショートカット</b><em>買い物リストに追加して</em></div></div></li><li><span>2</span><div><strong>「テキストを音声入力」を追加</strong><p>質問は「何を追加しますか？」にします。</p><div className="phone-visual accent"><b>何を追加しますか？</b><em>テキストを音声入力</em></div></div></li><li><span>3</span><div><strong>「URLの内容を取得」を追加</strong><p>POST・JSONで下のURLとトークンを設定します。</p></div></li></ol>
        <div className="code-field"><small>URL</small><code>{typeof window !== "undefined" ? `${window.location.origin}/api/siri/items` : "/api/siri/items"}</code><button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/api/siri/items`)}><Copy /></button></div>
        {!newSiriToken ? <button className="secondary-button" onClick={() => void generateSiriToken()}><KeyRound />iPhone用トークンを発行</button> : <div className="token-box"><p>このトークンは今だけ表示されます。Authorization欄へ <b>Bearer＋半角空白＋トークン</b> の順で入れてください。</p><div className="code-field"><code>{newSiriToken}</code><button onClick={() => navigator.clipboard.writeText(newSiriToken)}><Copy /></button></div></div>}
        {siriTokens.length > 0 && <div className="device-list"><p>登録済みのiPhone</p>{siriTokens.map((token) => <div key={token.id}><span><b>{token.label}</b><small>{token.last_used_at ? `最終利用 ${formatDate(token.last_used_at)}` : "未使用"}</small></span><button onClick={async () => { await api("/api/siri-tokens", { method: "DELETE", body: JSON.stringify({ id: token.id }) }); setSiriTokens((current) => current.filter((entry) => entry.id !== token.id)); }}>無効化</button></div>)}</div>}</div>

        <div className="settings-card"><div className="settings-title"><div className="setting-icon merge"><Merge /></div><div><h3>表記ゆれ確認</h3><p>自動候補を確認したり、商品名をドラッグして手動で統合できます。</p></div></div><div className="merge-help">商品名を別の商品名へドラッグすると、ドラッグした側を統合元にできます。</div>{mergeCandidates.filter((candidate) => !ignoredMergeKeys.includes(`${candidate.left.id}-${candidate.right.id}`)).length ? mergeCandidates.filter((candidate) => !ignoredMergeKeys.includes(`${candidate.left.id}-${candidate.right.id}`)).slice(0, 20).map((candidate) => <div className="merge-card" key={`${candidate.left.id}-${candidate.right.id}`}><div className="merge-names"><b draggable onDragStart={() => setDraggedProduct(candidate.left)} onDragEnd={() => setDraggedProduct(null)} onDragOver={(event) => event.preventDefault()} onDrop={() => draggedProduct ? void mergeProducts(draggedProduct, candidate.left) : undefined}>{candidate.left.name}</b><span>と</span><b draggable onDragStart={() => setDraggedProduct(candidate.right)} onDragEnd={() => setDraggedProduct(null)} onDragOver={(event) => event.preventDefault()} onDrop={() => draggedProduct ? void mergeProducts(draggedProduct, candidate.right) : undefined}>{candidate.right.name}</b>{candidate.warning && <p>{candidate.warning}</p>}</div><div className="merge-actions"><button onClick={() => void merge(candidate, "left")}>「{candidate.left.name}」に統合</button><button onClick={() => void merge(candidate, "right")}>「{candidate.right.name}」に統合</button><button className="merge-dismiss" onClick={() => { const key = `${candidate.left.id}-${candidate.right.id}`; setIgnoredMergeKeys((current) => { const next = current.includes(key) ? current : [...current, key]; window.localStorage.setItem(IGNORED_MERGES_KEY, JSON.stringify(next)); return next; }); }}>今回は別物</button></div></div>) : <p className="settings-empty">確認が必要な候補はありません。</p>}<div className="merge-history"><h4>統合した履歴</h4>{mergeHistory.length ? mergeHistory.map((entry) => <div className="merge-history-row" key={entry.id}><span><b>{entry.sourceName}</b> → <b>{entry.targetName}</b></span><small>{formatIsoDate(entry.mergedAt)}</small></div>) : <p className="settings-empty">まだ統合履歴はありません。</p>}</div></div>
        <div className="settings-card compact"><button className="logout-button" onClick={async () => { await api("/api/auth/session", { method: "DELETE" }); location.reload(); }}><LogOut />ログアウト</button></div>
      </section>}
    </main>
    <nav className="bottom-nav" aria-label="メインメニュー">{([{ id: "list", label: "買うもの", icon: ListChecks }, { id: "soon", label: "そろそろ", icon: Sparkles }, { id: "history", label: "履歴", icon: History }, { id: "settings", label: "設定", icon: Settings }] as const).map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}><Icon /><span>{label}</span>{id === "soon" && recommendations.length > 0 && <i>{recommendations.length}</i>}</button>)}</nav>
    {toast && <div className="toast"><Check />{toast}</div>}
  </div>;
}


