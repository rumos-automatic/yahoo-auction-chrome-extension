// DOM要素の取得
const csvFileInput = document.getElementById('csvFile');
const imageFolderButton = document.getElementById('imageFolderButton');
const csvFileName = document.getElementById('csvFileName');
const imageFolderName = document.getElementById('imageFolderName');
const retryCountInput = document.getElementById('retryCount');
const chatworkToggle = document.getElementById('chatworkToggle');
const chatworkSettings = document.getElementById('chatworkSettings');
const chatworkApiKey = document.getElementById('chatworkApiKey');
const chatworkRoomId = document.getElementById('chatworkRoomId');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const statusBox = document.getElementById('statusBox');
const statusText = document.getElementById('statusText');
const logContainer = document.getElementById('logContainer');

// グローバル状態
let csvData = null;
let imageFolderSelected = false;
let isRunning = false;

// 初期化
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupEventListeners();
  checkReadyState();
});

// 設定の読み込み
async function loadSettings() {
  const result = await chrome.storage.local.get([
    'retryCount',
    'chatworkEnabled',
    'chatworkApiKey',
    'chatworkRoomId'
  ]);

  if (result.retryCount) retryCountInput.value = result.retryCount;
  if (result.chatworkEnabled) chatworkToggle.checked = result.chatworkEnabled;
  if (result.chatworkApiKey) chatworkApiKey.value = result.chatworkApiKey;
  if (result.chatworkRoomId) chatworkRoomId.value = result.chatworkRoomId;

  // ChatWork設定の表示切替
  chatworkSettings.style.display = chatworkToggle.checked ? 'block' : 'none';
}

// イベントリスナーの設定
function setupEventListeners() {
  // CSVファイル選択
  csvFileInput.addEventListener('change', handleCsvFileSelect);

  // 画像フォルダ選択（ボタンクリック）
  imageFolderButton.addEventListener('click', handleImageFolderSelect);

  // ChatWorkトグル
  chatworkToggle.addEventListener('change', () => {
    chatworkSettings.style.display = chatworkToggle.checked ? 'block' : 'none';
    saveSettings();
  });

  // 設定変更時に保存
  retryCountInput.addEventListener('change', saveSettings);
  chatworkApiKey.addEventListener('change', saveSettings);
  chatworkRoomId.addEventListener('change', saveSettings);

  // 開始ボタン
  startButton.addEventListener('click', startListing);

  // 停止ボタン
  stopButton.addEventListener('click', stopListing);

  // バックグラウンドからのメッセージ受信
  chrome.runtime.onMessage.addListener(handleMessage);
}

// CSVファイルの処理
async function handleCsvFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  csvFileName.textContent = file.name;

  try {
    const text = await file.text();
    csvData = parseCSV(text);
    addLog(`CSVファイルを読み込みました: ${csvData.length}件`, 'info');
    checkReadyState();
  } catch (error) {
    addLog(`CSVファイルの読み込みエラー: ${error.message}`, 'error');
    csvData = null;
  }
}

// 画像フォルダの処理（File System Access API使用）
async function handleImageFolderSelect(event) {
  try {
    // Content Scriptに画像フォルダ選択を指示
    const tabs = await chrome.tabs.query({
      url: 'https://auctions.yahoo.co.jp/sell/jp/show/submit*'
    });

    if (tabs.length === 0) {
      addLog('ヤフオク出品ページを開いてください', 'error');
      return;
    }

    // Content Scriptに指示を送信
    await chrome.tabs.sendMessage(tabs[0].id, {
      action: 'selectImageFolder'
    });

    addLog('画像フォルダを選択してください（ポップアップが表示されます）', 'info');

  } catch (error) {
    addLog(`エラー: ${error.message}`, 'error');
  }
}

// CSV解析（簡易版）
function parseCSV(text) {
  const lines = text.split('\n').filter(line => line.trim());
  if (lines.length < 2) throw new Error('CSVデータが不正です');

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

// 準備状態のチェック
function checkReadyState() {
  const isReady = csvData && imageFolderSelected;
  startButton.disabled = !isReady || isRunning;

  if (isReady && !isRunning) {
    updateStatus('準備完了', 'success');
  }
}

// 設定の保存
async function saveSettings() {
  await chrome.storage.local.set({
    retryCount: parseInt(retryCountInput.value),
    chatworkEnabled: chatworkToggle.checked,
    chatworkApiKey: chatworkApiKey.value,
    chatworkRoomId: chatworkRoomId.value
  });
}

// 出品開始
async function startListing() {
  if (!csvData || !imageFolderSelected) {
    addLog('CSVファイルと画像フォルダを選択してください', 'error');
    return;
  }

  isRunning = true;
  startButton.style.display = 'none';
  stopButton.style.display = 'block';

  updateStatus('出品作業中...', 'working');
  progressBar.style.width = '0%';
  progressText.textContent = `0/${csvData.length} 出品完了`;

  addLog('自動出品を開始します', 'info');

  // バックグラウンドスクリプトに出品データを送信
  chrome.runtime.sendMessage({
    action: 'startListing',
    data: {
      items: csvData,
      settings: {
        retryCount: parseInt(retryCountInput.value),
        chatwork: {
          enabled: chatworkToggle.checked,
          apiKey: chatworkApiKey.value,
          roomId: chatworkRoomId.value
        }
      }
    }
  });
}


// 出品停止
function stopListing() {
  chrome.runtime.sendMessage({ action: 'stopListing' });
  isRunning = false;
  startButton.style.display = 'block';
  stopButton.style.display = 'none';
  updateStatus('停止しました', 'preparing');
  addLog('出品を停止しました', 'info');
}

// バックグラウンドからのメッセージ処理
function handleMessage(message) {
  switch (message.type) {
    case 'progress':
      updateProgress(message.current, message.total);
      break;
    case 'log':
      addLog(message.message, message.level);
      break;
    case 'complete':
      handleComplete();
      break;
    case 'error':
      handleError(message.error);
      break;
  }

  // Content Scriptからのフォルダ選択完了メッセージ
  if (message.action === 'folderSelected') {
    if (message.success) {
      imageFolderSelected = true;
      imageFolderName.textContent = '選択済み';
      addLog('画像フォルダを登録しました', 'success');
      checkReadyState();
    } else {
      imageFolderSelected = false;
      imageFolderName.textContent = '未選択';
      addLog(`フォルダ選択エラー: ${message.error}`, 'error');
    }
  }
}

// 進捗の更新
function updateProgress(current, total) {
  const percentage = (current / total) * 100;
  progressBar.style.width = `${percentage}%`;
  progressText.textContent = `${current}/${total} 出品完了`;
}

// 完了処理
function handleComplete() {
  isRunning = false;
  startButton.style.display = 'block';
  stopButton.style.display = 'none';
  updateStatus('出品作業完了', 'success');
  addLog('すべての出品作業が完了しました', 'success');

  // 完了通知
  chrome.notifications.create({
    type: 'basic',
    iconUrl: '../icons/icon128.png',
    title: 'ヤフオク自動出品ツール',
    message: 'すべての出品作業が完了しました'
  });
}

// エラー処理
function handleError(error) {
  isRunning = false;
  startButton.style.display = 'block';
  stopButton.style.display = 'none';
  updateStatus('エラー発生', 'error');
  addLog(`エラー: ${error}`, 'error');
}

// ステータス更新
function updateStatus(text, type) {
  statusText.textContent = text;
  statusBox.className = `status-box ${type}`;
}

// ログ追加
function addLog(message, level = 'info') {
  const timestamp = new Date().toLocaleTimeString('ja-JP');
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry ${level}`;
  logEntry.textContent = `[${timestamp}] ${message}`;

  // 最初のログエントリを削除して新しいログを追加
  if (logContainer.firstChild && logContainer.firstChild.textContent === 'ログがここに表示されます...') {
    logContainer.innerHTML = '';
  }

  logContainer.appendChild(logEntry);
  logContainer.scrollTop = logContainer.scrollHeight;
}
