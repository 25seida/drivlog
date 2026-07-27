let currentDriverId = null;
let driversList = [];

// ステータスの日本語表示マッピング
const statusMap = {
  'OFFLINE': { text: '業務終了 (未稼働)', class: 'status-OFFLINE' },
  'DRIVING': { text: '運行中', class: 'status-DRIVING' },
  'WAITING': { text: '待機中 (荷待ち)', class: 'status-WAITING' },
  'WORKING': { text: '荷役中 (積込/荷降)', class: 'status-WORKING' }
};

document.addEventListener('DOMContentLoaded', () => {
  loadDrivers();
  
  document.getElementById('driver-select').addEventListener('change', (e) => {
    const selectedId = parseInt(e.target.value);
    const driver = driversList.find(d => d.id === selectedId);
    if (driver) {
      currentDriverId = selectedId;
      // ログイン前は車両情報や操作パネルを隠し、暗証番号入力フォームを表示
      document.getElementById('auth-section').style.display = 'block';
      document.getElementById('driver-pin').value = '';
      document.getElementById('driver-pin').focus();
      
      document.getElementById('driver-info').style.display = 'none';
      const statusPanel = document.getElementById('status-panel');
      statusPanel.style.opacity = '0.6';
      statusPanel.style.pointerEvents = 'none';
    }
  });
});

async function loginDriver() {
  if (!currentDriverId) return;
  const pinInput = document.getElementById('driver-pin');
  const pin = pinInput.value.trim();
  
  if (!pin) {
    alert('暗証番号を入力してください。');
    return;
  }
  
  try {
    const response = await fetch('/api/drivers/auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        driver_id: currentDriverId,
        pin: pin
      })
    });
    
    if (response.ok) {
      showToast('ログインしました');
      
      const driver = driversList.find(d => d.id === currentDriverId);
      document.getElementById('vehicle-num').innerText = driver.vehicle_number;
      
      // UIの表示切替
      document.getElementById('auth-section').style.display = 'none';
      document.getElementById('driver-info').style.display = 'block';
      
      const statusPanel = document.getElementById('status-panel');
      statusPanel.style.opacity = '1';
      statusPanel.style.pointerEvents = 'auto';
      
      updateCurrentStatusUI();
    } else {
      const err = await response.json();
      alert(err.detail || '暗証番号が正しくありません。');
      pinInput.value = '';
    }
  } catch (error) {
    console.error(error);
    alert('通信エラーが発生しました。');
  }
}

function logoutDriver() {
  currentDriverId = null;
  document.getElementById('driver-select').value = '';
  document.getElementById('auth-section').style.display = 'none';
  document.getElementById('driver-info').style.display = 'none';
  
  const statusPanel = document.getElementById('status-panel');
  statusPanel.style.opacity = '0.6';
  statusPanel.style.pointerEvents = 'none';
  
  const badge = document.getElementById('current-status-badge');
  badge.textContent = '未選択';
  badge.className = 'status-badge status-OFFLINE';
  
  document.getElementById('history-panel').style.display = 'none';
  document.getElementById('history-list').innerHTML = '';
}

async function loadDrivers() {
  try {
    const response = await fetch('/api/drivers');
    driversList = await response.json();
    
    const select = document.getElementById('driver-select');
    select.innerHTML = '<option value="" disabled selected>ドライバーを選択してください</option>';
    
    driversList.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = `${d.name} (${d.vehicle_number})`;
      select.appendChild(opt);
    });
  } catch (error) {
    console.error('ドライバーの読み込みに失敗しました', error);
  }
}

async function updateCurrentStatusUI() {
  if (!currentDriverId) return;
  
  try {
    const response = await fetch('/api/logs/today');
    const data = await response.json();
    const statusData = data.find(item => item.driver_id === currentDriverId);
    
    if (statusData) {
      const badge = document.getElementById('current-status-badge');
      const statusInfo = statusMap[statusData.current_status] || { text: statusData.current_status, class: 'status-OFFLINE' };
      
      badge.textContent = statusInfo.text;
      badge.className = `status-badge ${statusInfo.class}`;
      
      // ボタンのアクティブ状態の制御（同じステータスは無効化）
      document.getElementById('btn-driving').disabled = statusData.current_status === 'DRIVING';
      document.getElementById('btn-waiting').disabled = statusData.current_status === 'WAITING';
      document.getElementById('btn-working').disabled = statusData.current_status === 'WORKING';
      document.getElementById('btn-offline').disabled = statusData.current_status === 'OFFLINE';
      
      // 履歴のロード（簡易的に本日のログをAPIから再構築）
      loadHistory();
    }
  } catch (error) {
    console.error('ステータスの更新に失敗しました', error);
  }
}

async function loadHistory() {
  if (!currentDriverId) return;
  try {
    const response = await fetch(`/api/drivers/${currentDriverId}/logs/today`);
    if (!response.ok) throw new Error('Failed to fetch history');
    const logs = await response.json();
    
    const historyPanel = document.getElementById('history-panel');
    const list = document.getElementById('history-list');
    list.innerHTML = '';
    
    if (logs.length > 0) {
      historyPanel.style.display = 'block';
      logs.forEach(l => {
        addLocalHistory(l.status, l.timestamp, l.note);
      });
    } else {
      historyPanel.style.display = 'none';
    }
  } catch (e) {
    console.error('履歴の取得に失敗しました', e);
  }
}

// 履歴用ローカルストレージヘルパー（スマホ側の操作ログ確認用）
function addLocalHistory(status, timestamp, note) {
  const historyPanel = document.getElementById('history-panel');
  historyPanel.style.display = 'block';
  
  const list = document.getElementById('history-list');
  const tr = document.createElement('tr');
  
  const time = new Date(timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const statusInfo = statusMap[status] || { text: status, class: 'status-OFFLINE' };
  
  tr.innerHTML = `
    <td>${time}</td>
    <td><span class="status-badge ${statusInfo.class}">${statusInfo.text}</span></td>
    <td>${note || '-'}</td>
  `;
  
  if (list.firstChild) {
    list.insertBefore(tr, list.firstChild);
  } else {
    list.appendChild(tr);
  }
}

async function updateStatus(status) {
  if (!currentDriverId) return;
  
  const noteInput = document.getElementById('action-note');
  const note = noteInput.value.trim();
  
  try {
    const response = await fetch('/api/logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        driver_id: currentDriverId,
        status: status,
        note: note || null
      })
    });
    
    if (response.ok) {
      const resData = await response.json();
      showToast(`${statusMap[status].text} を記録しました`);
      noteInput.value = '';
      
      // UI状態を同期
      updateCurrentStatusUI();
    } else {
      alert('ステータスの更新に失敗しました。');
    }
  } catch (error) {
    console.error(error);
    alert('通信エラーが発生しました。');
  }
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}
