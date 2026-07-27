const statusMap = {
  'OFFLINE': { text: '業務終了 (未稼働)', class: 'status-OFFLINE' },
  'DRIVING': { text: '運行中', class: 'status-DRIVING' },
  'WAITING': { text: '待機中 (荷待ち)', class: 'status-WAITING' },
  'WORKING': { text: '荷役中 (積込/荷降)', class: 'status-WORKING' }
};

document.addEventListener('DOMContentLoaded', () => {
  fetchStatus();
  
  // 10秒ごとに自動更新
  setInterval(fetchStatus, 10000);
});

async function fetchStatus(showNotification = false) {
  try {
    const response = await fetch('/api/logs/today');
    if (!response.ok) throw new Error('Network response was not ok');
    
    const data = await response.json();
    const tbody = document.getElementById('status-table-body');
    
    if (data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center;" class="text-muted">ドライバーが登録されていません。下のフォームから登録してください。</td></tr>`;
      return;
    }
    
    tbody.innerHTML = '';
    
    data.forEach(item => {
      const tr = document.createElement('tr');
      
      const statusInfo = statusMap[item.current_status] || { text: item.current_status, class: 'status-OFFLINE' };
      
      // 合計待機時間のフォーマット (分から時間に変換)
      let waitTimeStr = `${item.total_wait_minutes} 分`;
      if (item.total_wait_minutes >= 60) {
        const hrs = Math.floor(item.total_wait_minutes / 60);
        const mins = Math.round(item.total_wait_minutes % 60);
        waitTimeStr = `${hrs}時間 ${mins}分`;
      }
      
      // 最終更新時刻のフォーマット
      let timeStr = '-';
      if (item.last_action_time) {
        const dt = new Date(item.last_action_time);
        timeStr = dt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      }
      
      // 待機時間が長い場合（たとえば1時間以上の待機）の警告ハイライト
      let waitWarningStyle = '';
      if (item.current_status === 'WAITING' && item.total_wait_minutes >= 60) {
        waitWarningStyle = 'style="color: var(--color-waiting); font-weight: bold;"';
      }
      
      tr.innerHTML = `
        <td><strong>${item.name}</strong></td>
        <td><span class="text-muted">${item.vehicle_number}</span></td>
        <td><span class="status-badge ${statusInfo.class}">${statusInfo.text}</span></td>
        <td ${waitWarningStyle}>${waitTimeStr}</td>
        <td>${timeStr}</td>
      `;
      tbody.appendChild(tr);
    });
    
    if (showNotification) {
      showToast('運行データを更新しました');
    }
  } catch (error) {
    console.error('ステータスの取得に失敗しました', error);
  }
}

async function addDriver(event) {
  event.preventDefault();
  
  const nameInput = document.getElementById('driver-name');
  const vehicleInput = document.getElementById('vehicle-number');
  const pinInput = document.getElementById('driver-pin-new');
  
  const name = nameInput.value.trim();
  const vehicle_number = vehicleInput.value.trim();
  const pin = pinInput.value.trim();
  
  try {
    const response = await fetch('/api/drivers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, vehicle_number, pin })
    });
    
    if (response.ok) {
      showToast('ドライバーを新しく登録しました');
      nameInput.value = '';
      vehicleInput.value = '';
      pinInput.value = '';
      fetchStatus();
    } else {
      const err = await response.json();
      alert(`登録に失敗しました: ${err.detail || '不明なエラー'}`);
    }
  } catch (error) {
    console.error(error);
    alert('通信エラーが発生しました。');
  }
}

async function resetSystem() {
  if (!confirm('本当にデータをリセットしますか？\nすべての運行ログが削除され、デフォルトのドライバー情報に戻ります。')) {
    return;
  }
  
  try {
    const response = await fetch('/api/reset', {
      method: 'POST'
    });
    
    if (response.ok) {
      showToast('システムを初期化しました');
      fetchStatus();
    } else {
      alert('リセットに失敗しました。');
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
  }, 2000);
}
