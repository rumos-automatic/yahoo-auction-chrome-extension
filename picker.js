// picker.js - フォルダ選択専用ページ

(async () => {
  try {
    // IndexedDB ヘルパー
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

    // フォルダ選択
    console.log('showDirectoryPicker() を呼び出します...');
    const dirHandle = await window.showDirectoryPicker();
    console.log('フォルダが選択されました:', dirHandle);

    // IndexedDB に保存
    await saveDirectoryHandle(dirHandle);
    console.log('IndexedDB に保存完了');

    // background.js に結果を送信
    chrome.runtime.sendMessage({
      action: 'folderSelected',
      success: true,
      dirHandle: dirHandle.name // ハンドル自体は送れないので名前だけ
    });

    // 成功メッセージを表示
    document.querySelector('.message').textContent = '✅ フォルダを登録しました！';
    document.querySelector('.loader').style.display = 'none';

    // 1秒後にタブを閉じる
    setTimeout(() => {
      window.close();
    }, 1000);

  } catch (error) {
    console.error('フォルダ選択エラー:', error);

    // エラーメッセージを表示
    document.querySelector('.message').textContent = `❌ エラー: ${error.message}`;
    document.querySelector('.loader').style.display = 'none';

    // background.js にエラーを送信
    chrome.runtime.sendMessage({
      action: 'folderSelected',
      success: false,
      error: error.message
    });

    // 2秒後にタブを閉じる
    setTimeout(() => {
      window.close();
    }, 2000);
  }
})();
