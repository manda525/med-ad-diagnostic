# Google Search Console 登録（完了済み・2026-09-09）

まさが所有権確認とサイトマップ送信を完了した。以下は実施記録。


所要：まさ 5分（うち待ち時間を除く）。私がやれない部分は「サイト所有者としての操作」だけ。

## 準備済み

- `pages/_document.js` が `google-site-verification` のメタタグを出す（値が入っていれば）
- sitemap は https://med-ad-diagnostic.vercel.app/sitemap.xml で配信中（13 URL）

## まさの操作

1. https://search.google.com/search-console を開き、Google アカウントでログイン
2. 「プロパティを追加」→ 右側の【URLプレフィックス】に `https://med-ad-diagnostic.vercel.app` を入れて「続行」
3. 所有権の確認で【HTMLタグ】を開き、`<meta name="google-site-verification" content="ここ" />` の「ここ」の文字列（英数字と記号の並び）をコピー
4. その文字列を、このチャットに貼る。私が `pages/_document.js` に入れて本番に反映する（数分）
5. 反映後、Search Console に戻って「確認」を押す
6. 左メニュー「サイトマップ」→「新しいサイトマップの追加」に `sitemap.xml` と入れて「送信」

これで終わり。インデックスは数日〜2週間で進む。

## 代替（私に貼りたくない場合）

Vercel のプロジェクト → Settings → Environment Variables に `NEXT_PUBLIC_GSC_VERIFICATION` として値を入れ、Redeploy する。


## 実施記録

- 2026-09-09：所有権確認（HTMLタグ方式）完了。`pages/_document.js` の `GSC_VERIFICATION` 定数に確認用文字列を設定済み
- 2026-09-09：`sitemap.xml`（当時13件）を送信済み
- インデックス登録の進捗は Search Console の「ページ」メニューで確認できる。数日〜2週間で反映が進む見込み
