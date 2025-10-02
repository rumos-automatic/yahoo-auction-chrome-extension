// グローバル状態管理
let listingState = {
  isRunning: false,
  items: [],
  settings: {},
  currentIndex: 0,
  retryCount: 0
};

// メッセージリスナー
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'selectImageFolder':
      handleSelectImageFolder(sendResponse);
      return true; // 非同期レスポンス
    case 'startListing':
      handleStartListing(message.data);
      break;
    case 'stopListing':
      handleStopListing();
      break;
    case 'itemPosted':
      handleItemPosted(message.success, message.error);
      break;
    case 'getNextItem':
      sendResponse(getNextItem());
      break;
  }
  return true; // 非同期レスポンスを許可
});

// 画像フォルダ選択処理（background経由）
async function handleSelectImageFolder(sendResponse) {
  try {
    // 新しいタブを開いてそこでフォルダ選択
    const tab = await chrome.tabs.create({
      url: chrome.runtime.getURL('picker.html'),
      active: true
    });

    // picker.html からの応答を待つ
    const listener = (msg, sender) => {
      if (msg.action === 'folderSelected' && sender.tab.id === tab.id) {
        chrome.runtime.onMessage.removeListener(listener);
        chrome.tabs.remove(tab.id);
        sendResponse(msg);
      }
    };
    chrome.runtime.onMessage.addListener(listener);

  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

// 出品開始処理
async function handleStartListing(data) {
  listingState = {
    isRunning: true,
    items: data.items,
    settings: data.settings,
    currentIndex: 0,
    retryCount: 0
  };

  sendLog('出品処理を開始します', 'info');

  // ヤフオク出品ページのタブを取得または作成
  const tabs = await chrome.tabs.query({
    url: 'https://auctions.yahoo.co.jp/sell/jp/show/submit*'
  });

  let targetTab;
  if (tabs.length > 0) {
    targetTab = tabs[0];
    await chrome.tabs.update(targetTab.id, { active: true });
  } else {
    targetTab = await chrome.tabs.create({
      url: 'https://auctions.yahoo.co.jp/sell/jp/show/submit?category=0'
    });
  }

  // タブが完全に読み込まれるのを待つ
  await waitForTabLoad(targetTab.id);

  // 最初の商品を出品
  processNextItem(targetTab.id);
}

// タブの読み込み待機
function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 1000); // 追加の待機時間
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// 次の商品を処理
async function processNextItem(tabId) {
  if (!listingState.isRunning) {
    sendLog('出品処理が停止されました', 'info');
    return;
  }

  if (listingState.currentIndex >= listingState.items.length) {
    // すべての商品の出品完了
    handleComplete();
    return;
  }

  const item = listingState.items[listingState.currentIndex];
  sendLog(`出品中: ${item['タイトル']}`, 'info');

  // Content Scriptに出品データを送信
  try {
    await chrome.tabs.sendMessage(tabId, {
      action: 'postItem',
      item: item,
      settings: listingState.settings
    });
  } catch (error) {
    sendLog(`エラー: ${error.message}`, 'error');
    handleItemPosted(false, error.message);
  }
}

// 商品出品完了処理
async function handleItemPosted(success, error) {
  if (!listingState.isRunning) return;

  if (success) {
    // 成功: 次の商品へ
    const item = listingState.items[listingState.currentIndex];
    sendLog(`出品完了: ${item['タイトル']}`, 'success');

    listingState.currentIndex++;
    listingState.retryCount = 0;

    // 進捗を通知
    sendProgress(listingState.currentIndex, listingState.items.length);

    // 次の商品を処理
    const tabs = await chrome.tabs.query({
      url: 'https://auctions.yahoo.co.jp/sell/jp/show/submit*'
    });

    if (tabs.length > 0) {
      setTimeout(() => processNextItem(tabs[0].id), 2000);
    } else {
      sendLog('出品ページが見つかりません', 'error');
      handleError('出品ページが見つかりません');
    }

  } else {
    // 失敗: リトライ
    listingState.retryCount++;
    const maxRetry = listingState.settings.retryCount || 3;

    if (listingState.retryCount < maxRetry) {
      sendLog(`リトライ ${listingState.retryCount}/${maxRetry}`, 'info');

      // ページをリロードして再試行
      const tabs = await chrome.tabs.query({
        url: 'https://auctions.yahoo.co.jp/sell/jp/show/submit*'
      });

      if (tabs.length > 0) {
        await chrome.tabs.reload(tabs[0].id);
        await waitForTabLoad(tabs[0].id);
        setTimeout(() => processNextItem(tabs[0].id), 2000);
      }
    } else {
      // リトライ上限に達した
      const item = listingState.items[listingState.currentIndex];
      const errorMessage = `出品失敗: ${item['タイトル']}\n${error || '不明なエラー'}`;

      sendLog(errorMessage, 'error');

      // ChatWork通知
      if (listingState.settings.chatwork?.enabled) {
        await sendChatworkMessage(errorMessage);
      }

      handleError(errorMessage);
    }
  }
}

// 次の商品データを取得
function getNextItem() {
  if (listingState.currentIndex >= listingState.items.length) {
    return null;
  }
  return {
    item: listingState.items[listingState.currentIndex]
  };
}

// 出品停止処理
function handleStopListing() {
  listingState.isRunning = false;
  sendLog('出品処理を停止しました', 'info');
}

// 完了処理
function handleComplete() {
  listingState.isRunning = false;
  sendLog('すべての出品が完了しました', 'success');

  chrome.runtime.sendMessage({
    type: 'complete'
  });

  // ChatWork通知
  if (listingState.settings.chatwork?.enabled) {
    sendChatworkMessage(`すべての出品が完了しました\n出品数: ${listingState.items.length}件`);
  }
}

// エラー処理
function handleError(error) {
  listingState.isRunning = false;

  chrome.runtime.sendMessage({
    type: 'error',
    error: error
  });
}

// 進捗通知
function sendProgress(current, total) {
  chrome.runtime.sendMessage({
    type: 'progress',
    current: current,
    total: total
  });
}

// ログ送信
function sendLog(message, level = 'info') {
  chrome.runtime.sendMessage({
    type: 'log',
    message: message,
    level: level
  });
}

// ChatWorkメッセージ送信
async function sendChatworkMessage(message) {
  const { apiKey, roomId } = listingState.settings.chatwork;

  if (!apiKey || !roomId) {
    console.error('ChatWork設定が不完全です');
    return;
  }

  const endpoint = `https://api.chatwork.com/v2/rooms/${roomId}/messages`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'X-ChatWorkToken': apiKey,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `body=${encodeURIComponent(message)}`
    });

    if (!response.ok) {
      console.error('ChatWork送信エラー:', response.status);
    }
  } catch (error) {
    console.error('ChatWork送信エラー:', error);
  }
}
