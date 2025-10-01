// CSV解析ライブラリ

/**
 * CSVテキストを解析してオブジェクト配列に変換
 * @param {string} csvText - CSV文字列
 * @param {Object} options - オプション
 * @returns {Array<Object>}
 */
function parseCSV(csvText, options = {}) {
  const {
    delimiter = ',',
    skipEmptyLines = true,
    trimFields = true,
    encoding = 'utf-8'
  } = options;

  // 行に分割
  const lines = csvText.split(/\r?\n/);

  if (lines.length < 2) {
    throw new Error('CSVデータが不正です。ヘッダー行とデータ行が必要です。');
  }

  // ヘッダー行を解析
  const headers = parseLine(lines[0], delimiter, trimFields);

  if (headers.length === 0) {
    throw new Error('ヘッダー行が空です');
  }

  // データ行を解析
  const data = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];

    // 空行をスキップ
    if (skipEmptyLines && !line.trim()) {
      continue;
    }

    const values = parseLine(line, delimiter, trimFields);

    // 値が空の場合はスキップ
    if (values.length === 0 || values.every(v => !v)) {
      continue;
    }

    // オブジェクトを作成
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });

    data.push(row);
  }

  return data;
}

/**
 * CSV行を解析
 * @param {string} line - CSV行
 * @param {string} delimiter - 区切り文字
 * @param {boolean} trim - トリムするか
 * @returns {Array<string>}
 */
function parseLine(line, delimiter, trim) {
  const values = [];
  let currentValue = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // エスケープされた引用符
        currentValue += '"';
        i++; // 次の文字をスキップ
      } else {
        // 引用符の開始/終了
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      // 区切り文字（引用符外）
      values.push(trim ? currentValue.trim() : currentValue);
      currentValue = '';
    } else {
      currentValue += char;
    }
  }

  // 最後の値を追加
  values.push(trim ? currentValue.trim() : currentValue);

  return values;
}

/**
 * CSV形式の検証
 * @param {string} csvText - CSV文字列
 * @returns {Object} - 検証結果
 */
function validateCSV(csvText) {
  const result = {
    valid: true,
    errors: [],
    warnings: [],
    lineCount: 0,
    columnCount: 0
  };

  try {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim());
    result.lineCount = lines.length;

    if (lines.length < 2) {
      result.valid = false;
      result.errors.push('CSVファイルにはヘッダー行とデータ行が必要です');
      return result;
    }

    // ヘッダー行の列数を取得
    const headers = parseLine(lines[0], ',', true);
    result.columnCount = headers.length;

    // 各データ行の列数をチェック
    for (let i = 1; i < lines.length; i++) {
      const values = parseLine(lines[i], ',', true);
      if (values.length !== result.columnCount) {
        result.warnings.push(`行${i + 1}の列数が一致しません（期待: ${result.columnCount}, 実際: ${values.length}）`);
      }
    }

    // 必須カラムのチェック（ヤフオク用）
    const requiredColumns = ['タイトル', 'カテゴリ', '説明', '開始価格', '即決価格', '開催期間', '終了時間'];
    const missingColumns = requiredColumns.filter(col => !headers.includes(col));

    if (missingColumns.length > 0) {
      result.valid = false;
      result.errors.push(`必須カラムが不足しています: ${missingColumns.join(', ')}`);
    }

  } catch (error) {
    result.valid = false;
    result.errors.push(`CSV解析エラー: ${error.message}`);
  }

  return result;
}

/**
 * オブジェクト配列をCSVに変換
 * @param {Array<Object>} data - データ配列
 * @param {Object} options - オプション
 * @returns {string}
 */
function dataToCSV(data, options = {}) {
  const { delimiter = ',', includeHeader = true } = options;

  if (!data || data.length === 0) {
    return '';
  }

  // ヘッダーを取得
  const headers = Object.keys(data[0]);

  // CSV行を生成
  const lines = [];

  if (includeHeader) {
    lines.push(headers.map(h => escapeCSVValue(h)).join(delimiter));
  }

  // データ行を生成
  for (const row of data) {
    const values = headers.map(header => escapeCSVValue(row[header] || ''));
    lines.push(values.join(delimiter));
  }

  return lines.join('\n');
}

/**
 * CSV値をエスケープ
 * @param {string} value - 値
 * @returns {string}
 */
function escapeCSVValue(value) {
  const stringValue = String(value);

  // カンマ、改行、引用符を含む場合は引用符で囲む
  if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

/**
 * Shift-JISエンコーディングのCSVを読み込む
 * @param {File} file - ファイルオブジェクト
 * @returns {Promise<string>}
 */
async function readShiftJISFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        // Shift-JISをUTF-8にデコード
        const decoder = new TextDecoder('shift-jis');
        const text = decoder.decode(event.target.result);
        resolve(text);
      } catch (error) {
        reject(new Error(`エンコーディングエラー: ${error.message}`));
      }
    };

    reader.onerror = () => {
      reject(new Error('ファイル読み込みエラー'));
    };

    reader.readAsArrayBuffer(file);
  });
}

// グローバルスコープにエクスポート
if (typeof window !== 'undefined') {
  window.csvParser = {
    parseCSV,
    validateCSV,
    dataToCSV,
    readShiftJISFile
  };
}

// モジュールエクスポート（必要に応じて）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseCSV,
    validateCSV,
    dataToCSV,
    readShiftJISFile
  };
}
