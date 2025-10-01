// Content Script: ヤフオクページで実行されるスクリプト

console.log('ヤフオク自動出品ツール: Content Script loaded');

// ========================================
// IndexedDB ヘルパー関数
// ========================================

async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('yahooAuctionDB', 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('handles')) {
        db.createObjectStore('handles');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveDirectoryHandle(dirHandle) {
  const db = await openDB();
  const tx = db.transaction('handles', 'readwrite');
  tx.objectStore('handles').put(dirHandle, 'imageFolder');
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getDirectoryHandle() {
  const db = await openDB();
  const tx = db.transaction('handles', 'readonly');
  const request = tx.objectStore('handles').get('imageFolder');
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

// ========================================
// File System Access API
// ========================================

async function selectImageFolder() {
  try {
    const dirHandle = await window.showDirectoryPicker({ mode: 'read' });

    // 権限確認
    const permission = await dirHandle.requestPermission({ mode: 'read' });
    if (permission !== 'granted') {
      throw new Error('フォルダアクセスが拒否されました');
    }

    // IndexedDBに保存
    await saveDirectoryHandle(dirHandle);

    console.log('画像フォルダを保存しました');

    chrome.runtime.sendMessage({
      action: 'folderSelected',
      success: true
    });

  } catch (error) {
    console.error('フォルダ選択エラー:', error);
    chrome.runtime.sendMessage({
      action: 'folderSelected',
      success: false,
      error: error.message
    });
  }
}

// メッセージリスナー
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'selectImageFolder') {
    selectImageFolder();
  } else if (message.action === 'postItem') {
    postItem(message.item, message.settings)
      .then(() => {
        chrome.runtime.sendMessage({
          action: 'itemPosted',
          success: true
        });
      })
      .catch((error) => {
        chrome.runtime.sendMessage({
          action: 'itemPosted',
          success: false,
          error: error.message
        });
      });
  }
  return true;
});

// 商品出品メイン処理
async function postItem(item, settings) {
  try {
    // 処理開始時に広告を閉じる
    await closeAdIfExists();

    // 画像アップロード（File System Access API使用）
    await uploadImages(item);
    await sleep(3000);

    // 画像アップロード後に広告チェック
    await closeAdIfExists();

    // カテゴリ設定
    await setCategory(item['カテゴリ']);
    await sleep(randomDelay(1000, 3000));

    // タイトル入力
    await setTitle(item['タイトル']);
    await sleep(randomDelay(1000, 3000));

    // 説明文入力
    await setDescription(item['説明']);
    await sleep(randomDelay(1000, 3000));

    // 価格設定
    await setPrices(item['開始価格'], item['即決価格']);
    await sleep(randomDelay(1000, 3000));

    // 終了日時設定
    await setEndDateTime(item['開催期間'], item['終了時間']);
    await sleep(randomDelay(1000, 3000));

    // おすすめコレクション
    await setRecommendedCollection(item['おすすめコレクション']);
    await sleep(randomDelay(1000, 3000));

    // 自動再出品設定
    if (item['自動再出品']) {
      await setAutoResubmit(item['自動再出品']);
      await sleep(randomDelay(1000, 3000));
    }

    // 確認ボタンクリック前に広告チェック
    await closeAdIfExists();

    // 確認ボタンをクリック
    await clickConfirmButton();
    await sleep(randomDelay(1000, 3000));

    // 出品ボタンクリック前に広告チェック
    await closeAdIfExists();

    // 出品ボタンをクリック
    await clickSubmitButton();
    await sleep(randomDelay(2000, 8000));

    // 出品完了後に広告チェック
    await closeAdIfExists();

    // 続けて出品するリンクをクリック
    await clickContinueLink();

    return true;

  } catch (error) {
    console.error('出品エラー:', error);
    throw error;
  }
}

// 広告を閉じる（強化版）
async function closeAdIfExists() {
  try {
    // 方法1: IDセレクタで試行
    let adCloseButton = await waitForElement('#js-CampaignPRModal_submit', 3000, false);

    // 方法2: XPathで試行（方法1で見つからなかった場合）
    if (!adCloseButton) {
      adCloseButton = await waitForElement(
        '//*[@id="js-CampaignPRModal_submit"]',
        3000,
        false,
        true  // XPath使用
      );
    }

    // 広告ボタンが見つかった場合
    if (adCloseButton) {
      console.log('広告を検出しました。自動的に閉じます...');
      adCloseButton.click();
      await sleep(1000);
      console.log('広告を閉じました');
      return true;
    }

    return false;
  } catch (error) {
    // 広告がない場合は無視
    return false;
  }
}

// ページロード時に広告を自動クローズ
async function autoCloseAdsOnLoad() {
  // ページが完全に読み込まれるまで待機
  await sleep(2000);

  // 広告を閉じる（最大3回試行）
  for (let i = 0; i < 3; i++) {
    const closed = await closeAdIfExists();
    if (closed) {
      break;
    }
    await sleep(1000);
  }
}

// ページロード時に実行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoCloseAdsOnLoad);
} else {
  autoCloseAdsOnLoad();
}

// 画像アップロード（File System Access API使用）
async function uploadImages(item) {
  // ディレクトリハンドルを取得
  const dirHandle = await getDirectoryHandle();
  if (!dirHandle) {
    throw new Error('画像フォルダが選択されていません。先にフォルダを選択してください。');
  }

  // 権限再確認
  const permission = await dirHandle.queryPermission({ mode: 'read' });
  if (permission !== 'granted') {
    const newPermission = await dirHandle.requestPermission({ mode: 'read' });
    if (newPermission !== 'granted') {
      throw new Error('フォルダアクセス権限がありません');
    }
  }

  const imageInput = await waitForElement('#selectFileMultiple', 10000);
  const dataTransfer = new DataTransfer();

  // 必要な画像だけ取得（1〜5枚）
  let loadedCount = 0;
  for (let i = 1; i <= 5; i++) {
    const imageName = item[`画像${i}`];
    if (!imageName) continue;

    try {
      const fileHandle = await dirHandle.getFileHandle(imageName);
      const file = await fileHandle.getFile();
      dataTransfer.items.add(file);
      loadedCount++;
      console.log(`画像 ${imageName} を読み込みました`);
    } catch (error) {
      console.error(`画像 ${imageName} が見つかりません:`, error);
      // 見つからない画像はスキップして続行
    }
  }

  if (loadedCount === 0) {
    throw new Error('アップロードする画像がありません');
  }

  // FileListを設定
  imageInput.files = dataTransfer.files;

  // changeイベントを発火
  const event = new Event('change', { bubbles: true });
  imageInput.dispatchEvent(event);

  console.log(`${loadedCount}枚の画像をアップロードしました`);
}

// カテゴリ設定
async function setCategory(categoryValue) {
  const categoryInput = document.getElementsByName('category')[0];
  if (!categoryInput) throw new Error('カテゴリ入力欄が見つかりません');

  categoryInput.value = categoryValue;
  const event = new Event('change', { bubbles: true });
  categoryInput.dispatchEvent(event);
}

// タイトル入力
async function setTitle(title) {
  const titleInput = await waitForElement('#fleaTitleForm', 10000);
  titleInput.value = '';
  titleInput.focus();
  await typeText(titleInput, title);
}

// 説明文入力
async function setDescription(description) {
  // HTMLタグボタンをクリック
  const htmlTagButton = await waitForElement('#aucHTMLtag', 10000);
  htmlTagButton.click();
  await sleep(500);

  // 説明文入力
  const descInput = await waitForElement('[name="Description_plain_work"]', 10000);
  descInput.value = '';
  descInput.focus();
  await typeText(descInput, description);
}

// 価格設定
async function setPrices(startPrice, buyoutPrice) {
  // 開始価格
  const startPriceInput = await waitForElement('#auc_StartPrice_auction', 10000);
  startPriceInput.value = '';
  await typeText(startPriceInput, startPrice);

  // 即決価格を設定する展開ボタンをクリック
  const buyoutExpandButton = await waitForElement(
    "//dt[contains(@class, 'js-toggleExpand-trigger')][contains(text(), '即決価格を設定する')]",
    10000,
    true,
    true
  );
  buyoutExpandButton.click();
  await sleep(500);

  // 即決価格
  const buyoutPriceInput = await waitForElement('#auc_BidOrBuyPrice_auction', 10000);
  buyoutPriceInput.value = '';
  await typeText(buyoutPriceInput, buyoutPrice);
}

// 終了日時設定
async function setEndDateTime(endDate, endTime) {
  // 日付変換
  const convertedDate = convertDate(endDate);

  // 終了日
  const dateSelect = await waitForElement('#ClosingYMD', 10000);
  dateSelect.value = convertedDate;
  dateSelect.dispatchEvent(new Event('change', { bubbles: true }));

  // 終了時間
  const timeSelect = await waitForElement('#ClosingTime', 10000);
  timeSelect.value = endTime;
  timeSelect.dispatchEvent(new Event('change', { bubbles: true }));
}

// おすすめコレクション
async function setRecommendedCollection(collection) {
  const collectionInput = await waitForElement('#acMdAttentionAuc', 10000);
  collectionInput.value = '';
  await typeText(collectionInput, collection);
}

// 自動再出品設定
async function setAutoResubmit(numResubmit) {
  // 自動再出品を設定する展開ボタンをクリック
  const resubmitExpandButton = await waitForElement(
    "//dt[contains(@class, 'js-toggleExpand-trigger')][contains(text(), '自動再出品を設定する')]",
    10000,
    true,
    true
  );
  resubmitExpandButton.click();
  await sleep(500);

  // 再出品回数を選択
  const resubmitSelect = await waitForElement('#numResubmit', 10000);
  if (['1', '2', '3'].includes(numResubmit)) {
    resubmitSelect.value = numResubmit;
    resubmitSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

// 確認ボタンをクリック
async function clickConfirmButton() {
  const confirmButton = await waitForElement('#submit_form_btn', 10000);
  confirmButton.click();
}

// 出品ボタンをクリック
async function clickSubmitButton() {
  const submitButton = await waitForElement('#auc_preview_submit_down', 10000);
  submitButton.click();
}

// 続けて出品するリンクをクリック
async function clickContinueLink() {
  try {
    const continueLink = await waitForElement(
      "//a[contains(@href, '/sell/jp/show/submit')][@data-cl_cl_index='8']",
      10000,
      true,
      true
    );
    continueLink.click();
  } catch (error) {
    // リンクが見つからない場合は出品ページに遷移
    window.location.href = 'https://auctions.yahoo.co.jp/sell/jp/show/submit?category=0';
  }
}

// 要素の待機（タイムアウト付き）
function waitForElement(selector, timeout = 10000, required = true, useXPath = false) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const check = () => {
      let element;

      if (useXPath) {
        const result = document.evaluate(
          selector,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );
        element = result.singleNodeValue;
      } else {
        element = document.querySelector(selector);
      }

      if (element) {
        resolve(element);
      } else if (Date.now() - startTime > timeout) {
        if (required) {
          reject(new Error(`要素が見つかりません: ${selector}`));
        } else {
          resolve(null);
        }
      } else {
        setTimeout(check, 100);
      }
    };

    check();
  });
}

// テキストを人間らしく入力
async function typeText(element, text) {
  for (const char of text) {
    element.value += char;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(randomDelay(10, 50));
  }
}

// 日付変換
function convertDate(dateStr) {
  let converted = dateStr;
  if (converted.includes('/')) {
    converted = converted.replace(/\//g, '-');
  }

  const parts = converted.split('-');
  const year = parts[0];
  const month = parts[1].padStart(2, '0');
  const day = parts[2].padStart(2, '0');

  return `${year}-${month}-${day}`;
}

// スリープ
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ランダムな遅延時間
function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
