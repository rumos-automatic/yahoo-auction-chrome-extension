// 共通ユーティリティ関数

/**
 * スリープ関数
 * @param {number} ms - ミリ秒
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * ランダムな遅延時間を生成
 * @param {number} min - 最小値（ミリ秒）
 * @param {number} max - 最大値（ミリ秒）
 * @returns {number}
 */
function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 要素が表示されるまで待機
 * @param {string} selector - CSSセレクタまたはXPath
 * @param {number} timeout - タイムアウト（ミリ秒）
 * @param {boolean} required - 必須要素かどうか
 * @param {boolean} useXPath - XPathを使用するか
 * @returns {Promise<Element|null>}
 */
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

/**
 * テキストを人間らしくタイピング
 * @param {HTMLElement} element - 入力要素
 * @param {string} text - 入力テキスト
 */
async function typeText(element, text) {
  for (const char of text) {
    element.value += char;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(randomDelay(10, 50));
  }
}

/**
 * 日付フォーマット変換
 * @param {string} dateStr - 日付文字列
 * @returns {string} - YYYY-MM-DD形式
 */
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

/**
 * Data URLをBlobに変換
 * @param {string} dataUrl - Data URL
 * @returns {Blob}
 */
function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(',');
  const contentType = parts[0].match(/:(.*?);/)[1];
  const raw = window.atob(parts[1]);
  const rawLength = raw.length;
  const uint8Array = new Uint8Array(rawLength);

  for (let i = 0; i < rawLength; i++) {
    uint8Array[i] = raw.charCodeAt(i);
  }

  return new Blob([uint8Array], { type: contentType });
}

/**
 * Data URLをFileオブジェクトに変換
 * @param {string} dataUrl - Data URL
 * @param {string} filename - ファイル名
 * @returns {File}
 */
function dataUrlToFile(dataUrl, filename) {
  const blob = dataUrlToBlob(dataUrl);
  return new File([blob], filename, { type: blob.type });
}

/**
 * CSV文字列を解析
 * @param {string} csvText - CSV文字列
 * @returns {Array<Object>} - 解析されたデータ
 */
function parseCSV(csvText) {
  const lines = csvText.split('\n').filter(line => line.trim());

  if (lines.length < 2) {
    throw new Error('CSVデータが不正です');
  }

  const headers = lines[0].split(',').map(h => h.trim());
  const data = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const row = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });

    data.push(row);
  }

  return data;
}

/**
 * オブジェクトをクエリ文字列に変換
 * @param {Object} params - パラメータオブジェクト
 * @returns {string}
 */
function objectToQueryString(params) {
  return Object.keys(params)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
}

/**
 * エラーメッセージをフォーマット
 * @param {Error} error - エラーオブジェクト
 * @returns {string}
 */
function formatError(error) {
  if (error.message) {
    return error.message;
  }
  return String(error);
}

/**
 * タイムスタンプを取得
 * @returns {string}
 */
function getTimestamp() {
  const now = new Date();
  return now.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * ストレージにデータを保存
 * @param {string} key - キー
 * @param {*} value - 値
 */
async function saveToStorage(key, value) {
  return chrome.storage.local.set({ [key]: value });
}

/**
 * ストレージからデータを取得
 * @param {string} key - キー
 * @returns {Promise<*>}
 */
async function getFromStorage(key) {
  const result = await chrome.storage.local.get(key);
  return result[key];
}

/**
 * ストレージからデータを削除
 * @param {string} key - キー
 */
async function removeFromStorage(key) {
  return chrome.storage.local.remove(key);
}

// グローバルスコープにエクスポート（Content Scriptで使用）
if (typeof window !== 'undefined') {
  window.utils = {
    sleep,
    randomDelay,
    waitForElement,
    typeText,
    convertDate,
    dataUrlToBlob,
    dataUrlToFile,
    parseCSV,
    objectToQueryString,
    formatError,
    getTimestamp,
    saveToStorage,
    getFromStorage,
    removeFromStorage
  };
}
